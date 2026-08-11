import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppState, Element, ToolType, StrokeStyle, FillStyle, Edges } from "@/lib/types";
import { nanoid } from "nanoid";
import { getSelectionBounds } from "@/lib/math";
import { compareIndex, normalizeIndices, reindexToOrder, sortByIndex } from "@/lib/order";

/**
 * Undo is implemented over the synced document (see lib/collab/undo.ts) rather
 * than in the store, because it has to be per-user: reverting a whole scene
 * snapshot would take collaborators' work with it. The store keeps the actions
 * so callers don't need to know, and delegates.
 */
export interface UndoHandler {
    undo: () => void;
    redo: () => void;
}

let undoHandler: UndoHandler | null = null;

export const registerUndoHandler = (handler: UndoHandler): (() => void) => {
    undoHandler = handler;
    return () => {
        if (undoHandler === handler) undoHandler = null;
    };
};

/** Relay connection state, surfaced so the UI can show it honestly. */
export type ConnectionStatus = "offline" | "connecting" | "connected";

// Style applied to newly created elements (and the "last used" style).
export interface CurrentStyle {
    strokeColor: string;
    backgroundColor: string;
    strokeWidth: number;
    roughness: number;
    opacity: number;
    strokeStyle: StrokeStyle;
    fillStyle: FillStyle;
    edges: Edges;
    fontSize: number;
}

// Module-level debounce timer for persisted writes (see storage.setItem below).
let saveTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * True between beginGesture() and commitGesture(). Transient input state rather
 * than app state, so it lives outside the store and never triggers a render.
 */
let gestureActive = false;

const gestureEndListeners = new Set<() => void>();

/**
 * Ids touched since the current gesture opened.
 *
 * The sync layer holds mid-gesture edits back from the document, so peers would
 * otherwise see nothing until the pointer is released. Streaming just these
 * elements over presence shows the work as it happens, without writing a
 * document op per pointer move. Tracking ids here keeps that cheap: no diffing
 * the whole scene on every move to work out what changed.
 */
const gestureTouched = new Set<string>();

export const getGestureTouchedIds = (): Set<string> => gestureTouched;

const noteTouched = (ids: string[]) => {
    if (!gestureActive) return;
    ids.forEach((id) => gestureTouched.add(id));
};

/** True while a continuous edit is in progress. */
export const isGestureActive = () => gestureActive;

/**
 * Fires when a continuous edit finishes. The sync layer uses this to write one
 * transaction per gesture instead of one per pointer event: a 400-point pencil
 * stroke becomes a single document update rather than 400.
 */
export const onGestureEnd = (fn: () => void): (() => void) => {
    gestureEndListeners.add(fn);
    return () => { gestureEndListeners.delete(fn); };
};

interface Store {
    /**
     * Visible elements — tombstones excluded. This is what every consumer
     * (renderer, tools, hit-testing, export) wants, so it keeps the plain name.
     */
    elements: Element[];
    /**
     * Every element including tombstones. Only state that has to reconcile with
     * other peers reads this: persistence, history, and later the sync layer.
     */
    allElements: Element[];
    appState: AppState;
    /** Whether the document's undo stack has anything for *this* user. */
    canUndo: boolean;
    canRedo: boolean;
    isDarkMode: boolean;
    currentStyle: CurrentStyle;
    /**
     * Whether the drawing has been restored from storage yet. IndexedDB is
     * async, so this distinguishes "nothing drawn" from "not loaded yet".
     */
    isDocLoaded: boolean;
    /**
     * Room this session is in, or null for the private local canvas. The two are
     * separate documents and are never merged.
     */
    roomId: string | null;
    /** Relay connection state. Always "offline" outside a room. */
    connection: ConnectionStatus;
    /**
     * Peer whose viewport this canvas is mirroring, or null. Set by clicking
     * someone in the session panel; cleared the moment you pan or zoom
     * yourself, which is how you stop.
     */
    followingClientId: number | null;

    setDocLoaded: (loaded: boolean) => void;
    setSession: (roomId: string | null, connection: ConnectionStatus) => void;
    setConnection: (connection: ConnectionStatus) => void;
    setFollowing: (clientId: number | null) => void;
    setTool: (tool: ToolType) => void;
    addElement: (element: Element) => void;
    updateElement: (id: string, updates: Partial<Element>) => void;
    removeElement: (id: string) => void;
    removeElements: (ids: string[]) => void;
    setSelection: (ids: string[]) => void;
    setZoom: (zoom: number) => void;
    setScroll: (x: number, y: number) => void;
    /** Pan and zoom together, so mirroring a peer's viewport is one update. */
    setViewport: (viewport: { scrollX: number; scrollY: number; zoom: number }) => void;
    setElements: (elements: Element[]) => void;
    /**
     * Replace the element set from the synced document, which is the authority
     * on both content and order. Unlike setElements it does not re-index, carry
     * tombstones forward, or touch history — the document already decided all
     * three, and re-deciding here would fight it.
     */
    replaceAllElements: (elements: Element[]) => void;
    clearElements: () => void;
    toggleDarkMode: () => void;
    setCurrentStyle: (updates: Partial<CurrentStyle>) => void;

    group: (ids: string[]) => void;
    ungroup: (ids: string[]) => void;
    moveSelection: (direction: "front" | "back" | "forward" | "backward") => void;

    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
    zoomToFit: () => void;

    /**
     * Bracket a continuous edit — a drag, a draw, a resize, a slider sweep.
     * beginGesture() is idempotent, so tools can call it on every pointer move
     * without checking. commitGesture() closes it, and the sync layer writes the
     * whole gesture as one document transaction: one undo step, and one update
     * for peers, however many pointer events it took.
     *
     * One-shot edits (delete, paste, group) need no bracketing — each is already
     * a single store change, so it becomes a single transaction.
     */
    beginGesture: () => void;
    commitGesture: () => void;

    setUndoState: (canUndo: boolean, canRedo: boolean) => void;
    undo: () => void;
    redo: () => void;
}

/**
 * Single place the two element lists are derived from one another. Every
 * mutation returns this, so `elements` can never drift from `allElements`.
 */
const deriveElements = (all: Element[]) => ({
    allElements: all,
    elements: all.filter((el) => !el.isDeleted),
});

/** Mark elements deleted rather than dropping them — see lib/order.ts. */
const tombstone = (all: Element[], ids: Set<string>) => {
    const now = Date.now();
    return all.map((el) =>
        ids.has(el.id) && !el.isDeleted
            ? { ...el, isDeleted: true, updatedAt: now, version: el.version + 1 }
            : el
    );
};

const clampZoom = (z: number) => Math.max(0.1, Math.min(5, z));

// Keep the world point at the viewport centre fixed while changing zoom.
const zoomAroundCenter = (appState: AppState, newZoom: number): Partial<AppState> => {
    const cx = (typeof window !== "undefined" ? window.innerWidth : 0) / 2;
    const cy = (typeof window !== "undefined" ? window.innerHeight : 0) / 2;
    const worldX = (cx - appState.scrollX) / appState.zoom;
    const worldY = (cy - appState.scrollY) / appState.zoom;
    return {
        zoom: newZoom,
        scrollX: cx - worldX * newZoom,
        scrollY: cy - worldY * newZoom,
    };
};

export const useStore = create<Store>()(
    persist(
        (set) => ({
            elements: [],
            allElements: [],
            appState: {
                tool: "selection",
                selection: [],
                isDragging: false,
                zoom: 1,
                scrollX: 0,
                scrollY: 0,
            },
            canUndo: false,
            canRedo: false,
            isDarkMode: false,
            isDocLoaded: false,
            roomId: null,
            connection: "offline",
            followingClientId: null,
            currentStyle: {
                strokeColor: "#000000",
                backgroundColor: "transparent",
                strokeWidth: 2,
                roughness: 1,
                opacity: 100,
                strokeStyle: "solid",
                fillStyle: "hachure",
                edges: "sharp",
                fontSize: 20,
            },

            setDocLoaded: (loaded) => set(() => ({ isDocLoaded: loaded })),

            setSession: (roomId, connection) => set(() => ({ roomId, connection })),
            setConnection: (connection) => set(() => ({ connection })),
            setFollowing: (clientId) => set(() => ({ followingClientId: clientId })),

            setTool: (tool) =>
                set((state) => ({ appState: { ...state.appState, tool } })),

            setCurrentStyle: (updates) =>
                set((state) => ({ currentStyle: { ...state.currentStyle, ...updates } })),

            // Insert at the position its index calls for, keeping the array sorted.
            // New elements almost always land on top, so scan from the end.
            addElement: (element) =>
                set((state) => {
                    noteTouched([element.id]);
                    const next = [...state.allElements];
                    let i = next.length;
                    while (i > 0 && compareIndex(next[i - 1], element) > 0) i--;
                    next.splice(i, 0, element);
                    return deriveElements(next);
                }),

            // Entry point for elements from outside (files, paste, collaborators),
            // so this is where the sorted-by-index invariant gets re-established.
            // Callers pass visible elements; existing tombstones are carried over
            // so a delete is never silently forgotten.
            setElements: (elements) =>
                set((state) => {
                    const now = Date.now();
                    const incoming = new Set(elements.map((el) => el.id));
                    // Opened files predate these fields, so stamp what's missing.
                    const stamped = elements.map((el) =>
                        el.updatedAt ? el : { ...el, updatedAt: now }
                    );
                    const keptTombstones = state.allElements.filter(
                        (el) => el.isDeleted && !incoming.has(el.id)
                    );
                    return deriveElements(normalizeIndices([...stamped, ...keptTombstones]));
                }),

            updateElement: (id, updates) =>
                (noteTouched([id]),
                set((state) =>
                    deriveElements(
                        state.allElements.map((el) =>
                            el.id === id
                                ? { ...el, ...updates, updatedAt: Date.now(), version: el.version + 1 }
                                : el
                        )
                    )
                )),

            replaceAllElements: (elements) =>
                set(() => deriveElements(sortByIndex(elements))),

            removeElement: (id) =>
                (noteTouched([id]),
                set((state) => deriveElements(tombstone(state.allElements, new Set([id]))))),

            removeElements: (ids) =>
                (noteTouched(ids),
                set((state) => deriveElements(tombstone(state.allElements, new Set(ids))))),

            clearElements: () =>
                set((state) =>
                    deriveElements(tombstone(state.allElements, new Set(state.elements.map((el) => el.id))))
                ),

            group: (ids) =>
                set((state) => {
                    if (ids.length < 2) return state;
                    const groupId = nanoid();
                    const idSet = new Set(ids);
                    return {
                        ...deriveElements(
                            state.allElements.map((el) =>
                                idSet.has(el.id) ? { ...el, groupId } : el
                            )
                        ),
                    };
                }),

            ungroup: (ids) =>
                set((state) => {
                    const idSet = new Set(ids);
                    const groupIds = new Set(
                        state.elements
                            .filter((el) => idSet.has(el.id) && el.groupId)
                            .map((el) => el.groupId as string)
                    );
                    if (groupIds.size === 0) return state;
                    return {
                        ...deriveElements(
                            state.allElements.map((el) =>
                                el.groupId && groupIds.has(el.groupId)
                                    ? { ...el, groupId: undefined }
                                    : el
                            )
                        ),
                    };
                }),

            moveSelection: (direction) =>
                set((state) => {
                    const sel = new Set(state.appState.selection);
                    if (sel.size === 0) return state;
                    const els = state.elements;
                    let next: Element[];

                    if (direction === "front") {
                        next = [...els.filter((e) => !sel.has(e.id)), ...els.filter((e) => sel.has(e.id))];
                    } else if (direction === "back") {
                        next = [...els.filter((e) => sel.has(e.id)), ...els.filter((e) => !sel.has(e.id))];
                    } else {
                        // forward / backward: shift each selected element one step, keeping order stable.
                        next = [...els];
                        const order = direction === "forward"
                            ? [...next.keys()].reverse() // process top-most first when moving up
                            : [...next.keys()];
                        for (const i of order) {
                            if (!sel.has(next[i].id)) continue;
                            const swapWith = direction === "forward" ? i + 1 : i - 1;
                            if (swapWith < 0 || swapWith >= next.length) continue;
                            if (sel.has(next[swapWith].id)) continue; // don't reorder within the selection
                            [next[i], next[swapWith]] = [next[swapWith], next[i]];
                        }
                    }

                    // Ordering runs over visible elements only, so "one step
                    // forward" never gets absorbed by an invisible tombstone.
                    // The re-keyed results are then merged back into the full list.
                    const reordered = reindexToOrder(next, sel);
                    const byId = new Map(reordered.map((el) => [el.id, el]));

                    return {
                        // Re-key only what moved; untouched elements keep their index.
                        ...deriveElements(
                            sortByIndex(state.allElements.map((el) => byId.get(el.id) ?? el))
                        ),
                    };
                }),

            zoomIn: () =>
                set((state) => ({
                    appState: { ...state.appState, ...zoomAroundCenter(state.appState, clampZoom(state.appState.zoom * 1.2)) },
                })),

            zoomOut: () =>
                set((state) => ({
                    appState: { ...state.appState, ...zoomAroundCenter(state.appState, clampZoom(state.appState.zoom / 1.2)) },
                })),

            resetZoom: () =>
                set((state) => ({
                    appState: { ...state.appState, ...zoomAroundCenter(state.appState, 1) },
                })),

            zoomToFit: () =>
                set((state) => {
                    if (state.elements.length === 0) return state;
                    if (typeof window === "undefined") return state;
                    const bounds = getSelectionBounds(state.elements);
                    if (!isFinite(bounds.width) || !isFinite(bounds.height)) return state;
                    const padding = 80;
                    const vw = window.innerWidth;
                    const vh = window.innerHeight;
                    const zoom = clampZoom(
                        Math.min(
                            (vw - padding * 2) / Math.max(bounds.width, 1),
                            (vh - padding * 2) / Math.max(bounds.height, 1),
                            1
                        )
                    );
                    const scrollX = vw / 2 - (bounds.x + bounds.width / 2) * zoom;
                    const scrollY = vh / 2 - (bounds.y + bounds.height / 2) * zoom;
                    return { appState: { ...state.appState, zoom, scrollX, scrollY } };
                }),

            setSelection: (ids) =>
                set((state) => ({ appState: { ...state.appState, selection: ids } })),

            setZoom: (zoom) =>
                set((state) => ({ appState: { ...state.appState, zoom } })),

            setScroll: (x, y) =>
                set((state) => ({ appState: { ...state.appState, scrollX: x, scrollY: y } })),

            setViewport: ({ scrollX, scrollY, zoom }) =>
                set((state) => ({ appState: { ...state.appState, scrollX, scrollY, zoom } })),

            toggleDarkMode: () =>
                set((state) => ({ isDarkMode: !state.isDarkMode })),

            beginGesture: () => {
                if (gestureActive) return;
                gestureActive = true;
                gestureTouched.clear();
            },

            // Guarded so the pointer-release and pointer-press safety nets, which
            // fire on every click, don't notify listeners when nothing was open.
            commitGesture: () => {
                if (!gestureActive) return;
                gestureActive = false;
                // Listeners run before the set is cleared, so the sync layer can
                // still see what the gesture touched when it flushes.
                gestureEndListeners.forEach((fn) => fn());
                gestureTouched.clear();
            },

            setUndoState: (canUndo, canRedo) => set(() => ({ canUndo, canRedo })),

            // Delegated to the document's undo manager, which tracks only this
            // user's edits — see lib/collab/undo.ts.
            undo: () => undoHandler?.undo(),
            redo: () => undoHandler?.redo(),
        }),
        {
            name: "doodle-storage",
            version: 2,
            // v2 moved elements into the Yjs document (see lib/collab). Only
            // local preferences persist here now; the drawing itself is restored
            // from IndexedDB, and lib/collab/legacy.ts imports pre-v2 drawings.
            migrate: (persisted) => persisted as Store,
            partialize: (state) => ({
                isDarkMode: state.isDarkMode,
                currentStyle: state.currentStyle,
            }),
            storage: {
                getItem: (name) => {
                    const str = localStorage.getItem(name);
                    return str ? JSON.parse(str) : null;
                },
                setItem: (name, value) => {
                    // Debounce writes so rapid edits (e.g. dragging) don't thrash localStorage.
                    if (saveTimer) clearTimeout(saveTimer);
                    saveTimer = setTimeout(() => {
                        localStorage.setItem(name, JSON.stringify(value));
                    }, 1000); // Save 1 second after the last change
                },
                removeItem: (name) => localStorage.removeItem(name),
            },
        }
    )
);
