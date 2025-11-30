import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppState, Element, ToolType } from "@/lib/types";
import { nanoid } from "nanoid";

interface History {
    past: Element[][];
    future: Element[][];
}

interface Store {
    elements: Element[];
    appState: AppState;
    history: History;

    setTool: (tool: ToolType) => void;
    addElement: (element: Element) => void;
    updateElement: (id: string, updates: Partial<Element>) => void;
    removeElement: (id: string) => void;
    setSelection: (ids: string[]) => void;
    setZoom: (zoom: number) => void;
    setScroll: (x: number, y: number) => void;
    setElements: (elements: Element[]) => void;

    addToHistory: () => void;
    undo: () => void;
    redo: () => void;
}

export const useStore = create<Store>()(
    persist(
        (set, get) => ({
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

            setTool: (tool) =>
                set((state) => ({ appState: { ...state.appState, tool } })),

            addElement: (element) =>
                set((state) => ({ elements: [...state.elements, element] })),

            setElements: (elements) =>
                set(() => ({ elements })),

            updateElement: (id, updates) =>
                set((state) => ({
                    elements: state.elements.map((el) =>
                        el.id === id ? { ...el, ...updates } : el
                    ),
                })),

            removeElement: (id) =>
                set((state) => ({
                    elements: state.elements.filter((el) => el.id !== id),
                })),

            setSelection: (ids) =>
                set((state) => ({ appState: { ...state.appState, selection: ids } })),

            setZoom: (zoom) =>
                set((state) => ({ appState: { ...state.appState, zoom } })),

            setScroll: (x, y) =>
                set((state) => ({ appState: { ...state.appState, scrollX: x, scrollY: y } })),

            addToHistory: () =>
                set((state) => ({
                    history: {
                        past: [...state.history.past, state.elements],
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
            partialize: (state) => ({ elements: state.elements }), // Only persist elements
        }
    )
);
