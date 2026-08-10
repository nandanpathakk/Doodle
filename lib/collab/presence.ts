import type { Awareness } from "y-protocols/awareness";
import type { Element, ToolType } from "../types.ts";

/**
 * Presence: who else is here, where their pointer is, and what they have
 * selected.
 *
 * This rides the awareness channel rather than the document, which is the whole
 * point. Awareness state is ephemeral — never persisted, never part of undo
 * history, and dropped automatically when a peer disconnects. Cursors move at
 * ~30Hz per peer; putting that in the document would mean persisting and
 * versioning mouse movements.
 *
 * Remote presence is deliberately kept out of React state. At 30Hz per peer it
 * would re-render the app hundreds of times a second; instead the overlay
 * canvas reads it straight from here on its own frame loop. Only the roster —
 * who is here, and under what name and colour — reaches React, and that changes
 * only when someone joins, leaves, or renames.
 */

export interface Presence {
    name: string;
    color: string;
    /** Pointer position in world coordinates, or null when off-canvas. */
    cursor: { x: number; y: number } | null;
    selection: string[];
    tool: ToolType;
    /**
     * Elements being edited right now, before the gesture has been committed to
     * the document. This is what lets peers watch a shape being dragged out
     * rather than having it appear when the pointer is released.
     */
    draft: Element[] | null;
}

export interface Peer extends Presence {
    clientId: number;
}

/** Who is present, for the avatar list. Changes rarely, so it can live in React. */
export interface RosterEntry {
    clientId: number;
    name: string;
    color: string;
}

/**
 * Distinguishable at a glance and legible against both themes — these are drawn
 * as small cursors and thin outlines, not large fills.
 */
const PEER_COLORS = [
    "#e03131", "#1971c2", "#2f9e44", "#f08c00",
    "#9c36b5", "#0c8599", "#e8590c", "#c2255c",
];

export const colorForClient = (clientId: number): string =>
    PEER_COLORS[Math.abs(clientId) % PEER_COLORS.length];

const ADJECTIVES = ["Swift", "Quiet", "Bright", "Clever", "Calm", "Bold", "Keen", "Warm"];
const ANIMALS = ["Otter", "Heron", "Fox", "Ibis", "Marten", "Finch", "Lynx", "Crane"];

const NAME_KEY = "doodle-display-name";

/** A name to appear under, remembered between sessions. */
export const getDisplayName = (): string => {
    try {
        const stored = localStorage.getItem(NAME_KEY);
        if (stored) return stored;
    } catch {
        // Storage unavailable; fall through to a fresh name.
    }
    const name = `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${
        ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
    }`;
    setDisplayName(name);
    return name;
};

export const setDisplayName = (name: string): void => {
    try {
        localStorage.setItem(NAME_KEY, name);
    } catch {
        // Not worth failing over; the name just won't persist.
    }
};

// --- Live state -------------------------------------------------------------

let awareness: Awareness | null = null;
let localPresence: Presence | null = null;

/** Remote peers only, keyed by client id. Read by the overlay every frame. */
const remotePeers = new Map<number, Peer>();

const rosterListeners = new Set<() => void>();
let roster: RosterEntry[] = [];

/**
 * Ids of elements peers currently hold in a draft.
 *
 * The scene canvas hides these, because the peer's uncommitted version is being
 * drawn on the overlay — without it, an element being dragged appears twice:
 * once frozen where the document still has it, once following their pointer.
 *
 * Kept separate from the drafts themselves, and only republished when the *set*
 * changes, so hiding happens at gesture boundaries rather than re-rendering the
 * scene on every pointer move.
 */
const draftIdsListeners = new Set<() => void>();
let draftIds: string[] = [];

export const subscribeToDraftIds = (fn: () => void): (() => void) => {
    draftIdsListeners.add(fn);
    return () => { draftIdsListeners.delete(fn); };
};

export const getDraftIds = (): string[] => draftIds;

const refreshDraftIds = () => {
    const next: string[] = [];
    for (const peer of remotePeers.values()) {
        if (!peer.draft) continue;
        for (const element of peer.draft) next.push(element.id);
    }
    next.sort();
    if (next.length === draftIds.length && next.every((id, i) => id === draftIds[i])) return;
    draftIds = next;
    draftIdsListeners.forEach((fn) => fn());
};

export const getRemotePeers = (): Map<number, Peer> => remotePeers;

/**
 * Subscribe to roster changes. Shaped for useSyncExternalStore: the callback is
 * not invoked on subscribe, and getRoster returns a stable reference that only
 * changes when the roster genuinely differs.
 */
export const subscribeToRoster = (fn: () => void): (() => void) => {
    rosterListeners.add(fn);
    return () => { rosterListeners.delete(fn); };
};

export const getRoster = (): RosterEntry[] => roster;

const sameRoster = (a: RosterEntry[], b: RosterEntry[]) =>
    a.length === b.length &&
    a.every((entry, i) => entry.clientId === b[i].clientId && entry.name === b[i].name && entry.color === b[i].color);

/** Recompute the roster, notifying only when it actually differs. */
const refreshRoster = () => {
    const next = [...remotePeers.values()]
        .map(({ clientId, name, color }) => ({ clientId, name, color }))
        .sort((a, b) => a.clientId - b.clientId);
    if (sameRoster(next, roster)) return;
    roster = next;
    rosterListeners.forEach((fn) => fn());
};

const readRemoteStates = () => {
    if (!awareness) return;
    remotePeers.clear();
    awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness!.clientID) return;
        const presence = (state as { presence?: Presence }).presence;
        if (!presence) return;
        remotePeers.set(clientId, { ...presence, clientId });
    });
    refreshRoster();
    refreshDraftIds();
};

const onAwarenessChange = () => readRemoteStates();

/**
 * Attach to a room's awareness. Returns a teardown that also clears local
 * presence, so leaving does not leave a ghost cursor behind for everyone else.
 */
export function startPresence(a: Awareness): () => void {
    awareness = a;
    localPresence = {
        name: getDisplayName(),
        color: colorForClient(a.clientID),
        cursor: null,
        selection: [],
        tool: "selection",
        draft: null,
    };
    a.setLocalStateField("presence", localPresence);
    a.on("change", onAwarenessChange);
    readRemoteStates();

    return () => {
        a.off("change", onAwarenessChange);
        if (pendingPublish !== null) { clearTimeout(pendingPublish); pendingPublish = null; }
        a.setLocalStateField("presence", null);
        awareness = null;
        localPresence = null;
        remotePeers.clear();
        refreshRoster();
        refreshDraftIds();
    };
}

// --- Publishing -------------------------------------------------------------

let pendingPublish: ReturnType<typeof setTimeout> | null = null;

/** Roughly one animation frame — enough to collapse a burst of pointer events. */
const PUBLISH_INTERVAL_MS = 16;

/**
 * Publish at most once per frame's worth of time. Pointer events arrive faster
 * than anyone can see, and there is no value in sending a position nobody will
 * draw.
 *
 * Deliberately a timer rather than requestAnimationFrame: rAF does not run in a
 * hidden tab, so switching away mid-move would strand the pending publish and
 * peers would keep seeing a cursor that has actually gone. Timers still fire
 * when hidden (throttled, which is fine — nobody is watching), so the last
 * position and the withdrawal on leaving always get out.
 */
const publishSoon = () => {
    if (!awareness || pendingPublish !== null) return;
    pendingPublish = setTimeout(() => {
        pendingPublish = null;
        if (awareness && localPresence) awareness.setLocalStateField("presence", localPresence);
    }, PUBLISH_INTERVAL_MS);
};

export const publishCursor = (cursor: { x: number; y: number } | null): void => {
    if (!localPresence) return;
    const current = localPresence.cursor;
    if (current === cursor) return;
    if (current && cursor && current.x === cursor.x && current.y === cursor.y) return;
    localPresence = { ...localPresence, cursor };
    publishSoon();
};

export const publishSelection = (selection: string[]): void => {
    if (!localPresence) return;
    const current = localPresence.selection;
    if (current.length === selection.length && current.every((id, i) => id === selection[i])) return;
    localPresence = { ...localPresence, selection };
    publishSoon();
};

export const publishTool = (tool: ToolType): void => {
    if (!localPresence || localPresence.tool === tool) return;
    localPresence = { ...localPresence, tool };
    publishSoon();
};

/**
 * Stream the elements of an in-flight gesture, or null to clear.
 *
 * Published immediately rather than through the coalescer when clearing, so the
 * draft disappears the moment the real element arrives instead of lingering for
 * a frame as a duplicate.
 */
export const publishDraft = (draft: Element[] | null): void => {
    if (!localPresence) return;
    if (localPresence.draft === null && draft === null) return;
    localPresence = { ...localPresence, draft };
    if (draft === null) {
        if (pendingPublish !== null) { clearTimeout(pendingPublish); pendingPublish = null; }
        if (awareness) awareness.setLocalStateField("presence", localPresence);
        return;
    }
    publishSoon();
};

export const publishName = (name: string): void => {
    if (!localPresence || localPresence.name === name) return;
    setDisplayName(name);
    localPresence = { ...localPresence, name };
    publishSoon();
};

export const isPresenceActive = (): boolean => awareness !== null;


