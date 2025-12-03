import { Element } from "./types";

export function isPointInElement(x: number, y: number, element: Element): boolean {
    const { type, x: ex, y: ey, width, height } = element;

    // For lines and arrows, use proper distance-to-line-segment calculation
    if (type === "line" || type === "arrow") {
        if (!element.points || element.points.length < 2) return false;

        const start = element.points[0];
        const end = element.points[element.points.length - 1];

        // Increase threshold for easier selection (10px hit area)
        const threshold = 10;

        // Calculate distance from point to line segment
        const A = x - start.x;
        const B = y - start.y;
        const C = end.x - start.x;
        const D = end.y - start.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;

        if (param < 0) {
            xx = start.x;
            yy = start.y;
        } else if (param > 1) {
            xx = end.x;
            yy = end.y;
        } else {
            xx = start.x + param * C;
            yy = start.y + param * D;
        }

        const dx = x - xx;
        const dy = y - yy;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance < threshold;
    }

    // For pencil, check distance to any segment
    if (type === "pencil") {
        if (!element.points || element.points.length < 2) return false;

        const threshold = 10;

        for (let i = 0; i < element.points.length - 1; i++) {
            const start = element.points[i];
            const end = element.points[i + 1];

            const A = x - start.x;
            const B = y - start.y;
            const C = end.x - start.x;
            const D = end.y - start.y;

            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = -1;

            if (lenSq !== 0) param = dot / lenSq;

            let xx, yy;

            if (param < 0) {
                xx = start.x;
                yy = start.y;
            } else if (param > 1) {
                xx = end.x;
                yy = end.y;
            } else {
                xx = start.x + param * C;
                yy = start.y + param * D;
            }

            const dx = x - xx;
            const dy = y - yy;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < threshold) return true;
        }

        return false;
    }

    // Normalize bounds for other shapes
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

export const getLineControlPoint = (x: number, y: number, element: Element, zoom: number): "start" | "middle" | "end" | null => {
    if (!element.points || element.points.length < 2) return null;

    const start = element.points[0];
    const end = element.points[element.points.length - 1];
    const middle = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2
    };

    const handleSize = 10 / zoom;
    const threshold = handleSize / 2;

    if (Math.hypot(x - start.x, y - start.y) < threshold) return "start";
    if (Math.hypot(x - end.x, y - end.y) < threshold) return "end";
    if (Math.hypot(x - middle.x, y - middle.y) < threshold) return "middle";

    return null;
};
