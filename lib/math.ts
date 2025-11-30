import { Element } from "./types";

export function isPointInElement(x: number, y: number, element: Element): boolean {
    const { type, x: ex, y: ey, width, height } = element;

    // Normalize bounds
    const x1 = Math.min(ex, ex + width);
    const y1 = Math.min(ey, ey + height);
    const x2 = Math.max(ex, ex + width);
    const y2 = Math.max(ey, ey + height);

    switch (type) {
        case "rectangle":
        case "text":
            return x >= x1 && x <= x2 && y >= y1 && y <= y2;
        case "circle":
            // Ellipse hit test
            const h = x1 + (x2 - x1) / 2;
            const k = y1 + (y2 - y1) / 2;
            const a = (x2 - x1) / 2;
            const b = (y2 - y1) / 2;
            return ((x - h) ** 2) / (a ** 2) + ((y - k) ** 2) / (b ** 2) <= 1;
        case "pencil":
        case "line":
        case "arrow":
            // Simplified bounding box check for now
            // Ideally we check distance to segments
            const margin = 10;
            return x >= x1 - margin && x <= x2 + margin && y >= y1 - margin && y <= y2 + margin;
        default:
            return false;
    }
}

export const getElementAtPosition = (x: number, y: number, elements: Element[]): Element | null => {
    // Iterate in reverse to find top-most element
    for (let i = elements.length - 1; i >= 0; i--) {
        const element = elements[i];
        if (isPointInElement(x, y, element)) {
            return element;
        }
    }
    return null;
};

export const getSelectionBounds = (elements: Element[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((el) => {
        const ex = el.width < 0 ? el.x + el.width : el.x;
        const ey = el.height < 0 ? el.y + el.height : el.y;
        const ew = Math.abs(el.width);
        const eh = Math.abs(el.height);

        minX = Math.min(minX, ex);
        minY = Math.min(minY, ey);
        maxX = Math.max(maxX, ex + ew);
        maxY = Math.max(maxY, ey + eh);
    });

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export const getResizeHandleAtPosition = (x: number, y: number, bounds: { x: number, y: number, width: number, height: number }, zoom: number) => {
    const handleSize = 8 / zoom;
    const { x: bx, y: by, width, height } = bounds;
    const margin = 8 / zoom;

    // Bounds with margin
    const mx = bx - margin;
    const my = by - margin;
    const mw = width + margin * 2;
    const mh = height + margin * 2;

    const handles = [
        { id: "nw", x: mx, y: my },
        { id: "n", x: mx + mw / 2, y: my },
        { id: "ne", x: mx + mw, y: my },
        { id: "e", x: mx + mw, y: my + mh / 2 },
        { id: "se", x: mx + mw, y: my + mh },
        { id: "s", x: mx + mw / 2, y: my + mh },
        { id: "sw", x: mx, y: my + mh },
        { id: "w", x: mx, y: my + mh / 2 },
    ];

    for (const handle of handles) {
        if (
            x >= handle.x - handleSize / 2 &&
            x <= handle.x + handleSize / 2 &&
            y >= handle.y - handleSize / 2 &&
            y <= handle.y + handleSize / 2
        ) {
            return handle.id;
        }
    }
    return null;
};

export const getCursorForHandle = (handle: string) => {
    switch (handle) {
        case "n": return "ns-resize";
        case "s": return "ns-resize";
        case "w": return "ew-resize";
        case "e": return "ew-resize";
        case "nw": return "nwse-resize";
        case "se": return "nwse-resize";
        case "ne": return "nesw-resize";
        case "sw": return "nesw-resize";
        default: return "default";
    }
};
