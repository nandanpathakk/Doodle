export type ToolType = "selection" | "rectangle" | "circle" | "diamond" | "pencil" | "text" | "line" | "arrow" | "hand" | "eraser";

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
    onContainerBorder?: boolean; // If text is on the border of the container
    link?: string; // Optional link for elements
    strokeStyle?: StrokeStyle;   // solid / dashed / dotted
    fillStyle?: FillStyle;       // hachure / solid / cross-hatch
    edges?: Edges;               // sharp / round corners (rectangles)
    fontSize?: number;           // For text
    index: string;    // Fractional index carrying z-order — see lib/order.ts
    isDeleted?: boolean; // Tombstone: deleted elements are kept, not dropped
    updatedAt: number;   // Last-modified time, for tombstone GC
    version: number; // Version for cache invalidation
}

export type StrokeStyle = "solid" | "dashed" | "dotted";
export type FillStyle = "hachure" | "solid" | "cross-hatch";
export type Edges = "sharp" | "round";

export interface AppState {
    tool: ToolType;
    selection: string[]; // IDs of selected elements
    isDragging: boolean;
    zoom: number;
    scrollX: number;
    scrollY: number;
}
