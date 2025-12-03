import { AppState, Element, ToolType } from "@/lib/types";

export interface Tool {
    onMouseDown: (e: React.MouseEvent, context: ToolContext) => void;
    onMouseMove: (e: React.MouseEvent, context: ToolContext) => void;
    onMouseUp: (e: React.MouseEvent, context: ToolContext) => void;
}

export interface ToolContext {
    x: number;
    y: number;
    elements: Element[];
    appState: AppState;
    setElements: (elements: Element[]) => void;
    updateElement: (id: string, updates: Partial<Element>) => void;
    addElement: (element: Element) => void;
    setSelection: (ids: string[]) => void;
    setTool: (tool: ToolType) => void;
    setCursor: (cursor: string) => void;
    addToHistory: () => void;
    setTextInput: (input: { x: number; y: number; text: string; id: string } | null) => void;
    setSelectionRect: (rect: { x: number; y: number; width: number; height: number } | null) => void;
}
