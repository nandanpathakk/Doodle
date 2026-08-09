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

const toYElement = (el: Element): YElement => {
    const m: YElement = new Y.Map();
    for (const [k, v] of Object.entries(el)) {
        if (v !== undefined) m.set(k, v);
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

/** Read the whole element set back out, in z-order. */
export const docToElements = (yElements: YElements): Element[] => {
    const out: Element[] = [];
    yElements.forEach((yEl) => out.push(yEl.toJSON() as Element));
    return sortByIndex(out);
};
