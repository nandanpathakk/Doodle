import { AppState, Element, ToolType } from "@/lib/types";

export interface Tool {
    onMouseDown: (e: React.MouseEvent | React.TouchEvent, context: ToolContext) => void;
    onMouseMove: (e: React.MouseEvent | React.TouchEvent, context: ToolContext) => void;
    onMouseUp: (e: React.MouseEvent | React.TouchEvent, context: ToolContext) => void;
}

export interface ToolContext {
    x: number;
    y: number;
    elements: Element[];
    appState: AppState;
    setElements: (elements: Element[]) => void;
    updateElement: (id: string, updates: Partial<Element>) => void;
    addElement: (element: Element) => void;
    removeElement: (id: string) => void;
    setSelection: (ids: string[]) => void;
    setTool: (tool: ToolType) => void;
    setCursor: (cursor: string) => void;
    /**
     * Open a continuous edit. Safe to call on every pointer move — it snapshots
     * history only once per gesture. The gesture is closed centrally on pointer
     * release, so tools never need to call commitGesture themselves.
     */
    beginGesture: () => void;
    commitGesture: () => void;
    addToHistory: () => void;
    setTextInput: (input: { x: number; y: number; text: string; id: string } | null) => void;
    setSelectionRect: (rect: { x: number; y: number; width: number; height: number } | null) => void;
}
