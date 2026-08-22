import type { AppState, Element, ToolType } from "@/lib/types";
import type { TextInput } from "@/components/CanvasTextInput";

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
     * Open a continuous edit. Idempotent, so it is safe to call on every
     * pointer move. The gesture is closed centrally on pointer release, so
     * tools never need to call commitGesture themselves.
     */
    beginGesture: () => void;
    commitGesture: () => void;
    setTextInput: (input: TextInput | null) => void;
    setSelectionRect: (rect: { x: number; y: number; width: number; height: number } | null) => void;
}
