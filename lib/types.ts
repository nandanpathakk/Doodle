export type ToolType = "selection" | "rectangle" | "circle" | "diamond" | "pencil" | "text" | "line" | "arrow" | "hand";

export interface Point {
    x: number;
    y: number;
}

export interface Element {
    id: string;
    type: ToolType;
    x: number;
    y: number;
    width: number;
    height: number;
    strokeColor: string;
    backgroundColor: string;
    strokeWidth: number;
    roughness: number;
    opacity: number;
    points?: Point[]; // For pencil, line, arrow
    text?: string;
    seed: number;     // For consistent roughness
    groupId?: string; // For grouping
    textAlign?: "left" | "center" | "right";
    textBaseline?: "top" | "middle" | "bottom";
    containerElementId?: string; // ID of element this text is attached to
    link?: string; // Optional link for elements
}

export interface AppState {
    tool: ToolType;
    selection: string[]; // IDs of selected elements
    isDragging: boolean;
    zoom: number;
    scrollX: number;
    scrollY: number;
}
