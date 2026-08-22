import * as Y from "yjs";
import type { Element } from "../types.ts";
import { sortByIndex, TOMBSTONE_TTL_MS } from "../order.ts";

/**
 * Elements live in a Yjs document as `Y.Map<id, Y.Map<field>>` — a map per
 * element rather than one blob, so two people editing different fields of the
 * same element (one recolours while the other drags) both keep their change
 * instead of one overwriting the other.
 *
 * Every local write is tagged with this origin so the binding can tell its own
 * echo apart from a genuine remote change. Getting that wrong is an infinite
 * update loop, so it is asserted in the tests.
 */
export const LOCAL_ORIGIN = Symbol("doodle-local");

export const ELEMENTS_KEY = "elements";

export type YElement = Y.Map<unknown>;
export type YElements = Y.Map<YElement>;

export const getElementsMap = (doc: Y.Doc): YElements =>
    doc.getMap<YElement>(ELEMENTS_KEY);

/**
 * Field values are JSON-ish: numbers, strings, booleans, and the point arrays on
 * pencil/line/arrow. Points are compared and written whole — a stroke is only
 * committed once, at the end of the gesture, so there is nothing to gain from
 * merging into the middle of one.
 */
const sameValue = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
};

/**
 * `text` is the one field held as a collaborative type rather than a plain
 * value, because it is the one field two people edit *inside* at the same time.
 * Every other field is replaced whole — you cannot half-move a rectangle — but
 * two people typing in the same label at different offsets both mean it, and
 * writing the string whole would keep only whichever keystroke landed last.
 */
const TEXT_KEY = "text";

/**
 * Turn "the string is now this" into the smallest insert/delete that makes it
 * so, by keeping the common prefix and suffix.
 *
 * The diff lives here rather than in the editor on purpose: the rest of the app
 * says what an element *is* and knows nothing about sync, and a diff computed
 * against the document is correct even when a peer's edit landed between the
 * editor's last render and this write.
 *
 * A real character diff would do better on a reordering, but nobody reorders
 * text by retyping it — this is a caret, and a caret makes one contiguous edit.
 */
const applyTextDiff = (yText: Y.Text, next: string): void => {
    const current = yText.toString();
    if (current === next) return;

    const max = Math.min(current.length, next.length);
    let prefix = 0;
    while (prefix < max && current[prefix] === next[prefix]) prefix++;
    let suffix = 0;
    while (
        suffix < max - prefix &&
        current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
    ) suffix++;

    // Yjs indexes UTF-16 code units, as JavaScript does, so a boundary can land
    // between the halves of an astral character — an emoji — and split it into
    // two replacement characters. Back off rather than cut one in half.
    const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff;
    if (prefix > 0 && prefix < next.length && isLowSurrogate(next.charCodeAt(prefix))) prefix--;
    if (suffix > 0 && isLowSurrogate(next.charCodeAt(next.length - suffix))) suffix--;

    const removed = current.length - prefix - suffix;
    if (removed > 0) yText.delete(prefix, removed);
    const inserted = next.slice(prefix, next.length - suffix);
    if (inserted.length > 0) yText.insert(prefix, inserted);
};

/**
 * Set the text of an element, merging rather than replacing where possible.
 *
 * Documents written before text became collaborative hold a plain string; those
 * are upgraded on the first write. Nothing has to migrate eagerly, because
 * reading handles both.
 */
const setText = (yEl: YElement, next: string): void => {
    const current = yEl.get(TEXT_KEY);
    if (current instanceof Y.Text) {
        applyTextDiff(current, next);
        return;
    }
    yEl.set(TEXT_KEY, new Y.Text(next));
};

const toYElement = (el: Element): YElement => {
    const m: YElement = new Y.Map();
    for (const [k, v] of Object.entries(el)) {
        if (v === undefined) continue;
        if (k === TEXT_KEY) m.set(k, new Y.Text(v as string));
        else m.set(k, v);
    }
    return m;
};

/**
 * Write `elements` into the document, touching only what actually differs.
 *
 * Must run inside `doc.transact(..., LOCAL_ORIGIN)`. Writing only real changes
 * keeps the update log proportional to what the user did, not to how many
 * elements exist.
 */
export const applyElementsToDoc = (yElements: YElements, elements: Element[]): void => {
    const seen = new Set<string>();

    for (const el of elements) {
        seen.add(el.id);
        const existing = yElements.get(el.id);

        if (!existing) {
            yElements.set(el.id, toYElement(el));
            continue;
        }

        for (const [k, v] of Object.entries(el)) {
            if (v === undefined) {
                if (existing.has(k)) existing.delete(k);
            } else if (k === TEXT_KEY) {
                setText(existing, v as string);
            } else if (!sameValue(existing.get(k), v)) {
                existing.set(k, v);
            }
        }

        // Fields cleared locally (ungrouping drops groupId) must be cleared here too.
        for (const k of [...existing.keys()]) {
            if (!(k in el) || (el as unknown as Record<string, unknown>)[k] === undefined) {
                existing.delete(k);
            }
        }
    }

    // Deletion is normally a tombstone, so this only fires when an element is
    // dropped for good — a garbage-collected tombstone.
    for (const id of [...yElements.keys()]) {
        if (!seen.has(id)) yElements.delete(id);
    }
};

/**
 * Drop tombstones old enough that no peer could still be holding an un-synced
 * edit to them. Run once when the document loads, not on every mutation — a
 * tombstone has to outlive any peer that might otherwise resurrect the element.
 *
 * Must run inside `doc.transact(..., LOCAL_ORIGIN)`.
 */
export const gcDocTombstones = (yElements: YElements, now = Date.now()): number => {
    const stale: string[] = [];
    yElements.forEach((yEl, id) => {
        if (yEl.get("isDeleted") !== true) return;
        const updatedAt = (yEl.get("updatedAt") as number | undefined) ?? 0;
        if (now - updatedAt >= TOMBSTONE_TTL_MS) stale.push(id);
    });
    stale.forEach((id) => yElements.delete(id));
    return stale.length;
};

/**
 * Read the whole element set back out, in z-order.
 *
 * `toJSON` flattens the nested `Y.Text` back to a plain string, so the store
 * and everything above it still sees an ordinary `Element` and needs to know
 * nothing about how text is stored.
 */
export const docToElements = (yElements: YElements): Element[] => {
    const out: Element[] = [];
    yElements.forEach((yEl) => out.push(yEl.toJSON() as Element));
    return sortByIndex(out);
};

// --- Room metadata ----------------------------------------------------------

export const META_KEY = "meta";

/**
 * Whatever a room knows about itself. Currently just the name someone gave it.
 *
 * A top-level map of its own rather than a key inside the element map, for two
 * reasons that are easy to miss: the binding observes the element map and would
 * treat a rename as an element change, pulling the whole drawing back into the
 * store for it; and the undo manager is scoped to the element map, so a rename
 * is deliberately out of reach of Ctrl+Z. Renaming the room is not a drawing
 * edit and should not sit in the same history as one.
 */
export const getMetaMap = (doc: Y.Doc): Y.Map<string> => doc.getMap<string>(META_KEY);

const ROOM_NAME_KEY = "roomName";

/** The room's name, or "" when it has none — including before the first sync. */
export const readRoomName = (doc: Y.Doc): string =>
    (getMetaMap(doc).get(ROOM_NAME_KEY) ?? "").trim();

/** Set the room's name. Transacts on its own, tagged like every local write. */
export const writeRoomName = (doc: Y.Doc, name: string): void => {
    const next = name.trim();
    if (readRoomName(doc) === next) return;
    doc.transact(() => getMetaMap(doc).set(ROOM_NAME_KEY, next), LOCAL_ORIGIN);
};
