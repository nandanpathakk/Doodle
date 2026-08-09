import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppState, Element, ToolType, StrokeStyle, FillStyle, Edges } from "@/lib/types";
import { nanoid } from "nanoid";
import { getSelectionBounds } from "@/lib/math";
import { compareIndex, normalizeIndices, reindexToOrder } from "@/lib/order";

interface History {
    past: Element[][];
    future: Element[][];
}

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

// Cap history so memory doesn't grow without bound during long sessions.
const HISTORY_LIMIT = 100;

// Module-level debounce timer for persisted writes (see storage.setItem below).
let saveTimer: ReturnType<typeof setTimeout> | undefined;

interface Store {
    elements: Element[];
    appState: AppState;
    history: History;
    isDarkMode: boolean;
    currentStyle: CurrentStyle;

    setTool: (tool: ToolType) => void;
    addElement: (element: Element) => void;
    updateElement: (id: string, updates: Partial<Element>) => void;
    removeElement: (id: string) => void;
    removeElements: (ids: string[]) => void;
    setSelection: (ids: string[]) => void;
    setZoom: (zoom: number) => void;
    setScroll: (x: number, y: number) => void;
    setElements: (elements: Element[]) => void;
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

    addToHistory: () => void;
    undo: () => void;
    redo: () => void;
}

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
            appState: {
                tool: "selection",
                selection: [],
                isDragging: false,
                zoom: 1,
                scrollX: 0,
                scrollY: 0,
            },
            history: {
                past: [],
                future: [],
            },
            isDarkMode: false,
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

            setTool: (tool) =>
                set((state) => ({ appState: { ...state.appState, tool } })),

            setCurrentStyle: (updates) =>
                set((state) => ({ currentStyle: { ...state.currentStyle, ...updates } })),

            // Insert at the position its index calls for, keeping the array sorted.
            // New elements almost always land on top, so scan from the end.
            addElement: (element) =>
                set((state) => {
                    const next = [...state.elements];
                    let i = next.length;
                    while (i > 0 && compareIndex(next[i - 1], element) > 0) i--;
                    next.splice(i, 0, element);
                    return { elements: next };
                }),

            // Entry point for elements from outside (files, paste, collaborators),
            // so this is where the sorted-by-index invariant gets re-established.
            setElements: (elements) =>
                set(() => ({ elements: normalizeIndices(elements) })),

            updateElement: (id, updates) =>
                set((state) => ({
                    elements: state.elements.map((el) =>
                        el.id === id ? { ...el, ...updates, version: el.version + 1 } : el
                    ),
                })),

            removeElement: (id) =>
                set((state) => ({
                    elements: state.elements.filter((el) => el.id !== id),
                })),

            removeElements: (ids) =>
                set((state) => {
                    const idSet = new Set(ids);
                    return { elements: state.elements.filter((el) => !idSet.has(el.id)) };
                }),

            clearElements: () =>
                set(() => ({ elements: [] })),

            group: (ids) =>
                set((state) => {
                    if (ids.length < 2) return state;
                    const groupId = nanoid();
                    const idSet = new Set(ids);
                    return {
                        history: {
                            past: [...state.history.past, state.elements].slice(-HISTORY_LIMIT),
                            future: [],
                        },
                        elements: state.elements.map((el) =>
                            idSet.has(el.id) ? { ...el, groupId } : el
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
                        history: {
                            past: [...state.history.past, state.elements].slice(-HISTORY_LIMIT),
                            future: [],
                        },
                        elements: state.elements.map((el) =>
                            el.groupId && groupIds.has(el.groupId)
                                ? { ...el, groupId: undefined }
                                : el
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

                    return {
                        history: {
                            past: [...state.history.past, state.elements].slice(-HISTORY_LIMIT),
                            future: [],
                        },
                        // Re-key only what moved; untouched elements keep their index.
                        elements: reindexToOrder(next, sel),
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

            toggleDarkMode: () =>
                set((state) => ({ isDarkMode: !state.isDarkMode })),

            addToHistory: () =>
                set((state) => ({
                    history: {
                        past: [...state.history.past, state.elements].slice(-HISTORY_LIMIT),
                        future: [],
                    },
                })),

            undo: () =>
                set((state) => {
                    if (state.history.past.length === 0) return state;
                    const previous = state.history.past[state.history.past.length - 1];
                    const newPast = state.history.past.slice(0, -1);
                    return {
                        elements: previous,
                        history: {
                            past: newPast,
                            future: [state.elements, ...state.history.future],
                        },
                    };
                }),

            redo: () =>
                set((state) => {
                    if (state.history.future.length === 0) return state;
                    const next = state.history.future[0];
                    const newFuture = state.history.future.slice(1);
                    return {
                        elements: next,
                        history: {
                            past: [...state.history.past, state.elements],
                            future: newFuture,
                        },
                    };
                }),
        }),
        {
            name: "doodle-storage",
            // v1 introduced Element.index (z-order). Drawings saved before it
            // have none, so rebuild keys from the stored array order.
            version: 1,
            migrate: (persisted, version) => {
                const state = persisted as Partial<Store> | undefined;
                if (!state) return state as unknown as Store;
                if (version >= 1) return state as Store;
                return {
                    ...state,
                    elements: normalizeIndices(state.elements ?? []),
                } as Store;
            },
            partialize: (state) => ({
                elements: state.elements,
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
