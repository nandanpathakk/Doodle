import rough from "roughjs";
import { Element, AppState } from "./types";
import { getStroke } from "perfect-freehand";

export const renderScene = (
    canvas: HTMLCanvasElement,
    elements: Element[],
    appState: AppState,
    selectionRect?: { x: number; y: number; width: number; height: number } | null
) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { zoom, scrollX, scrollY, selection } = appState;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const rc = rough.canvas(canvas);

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(scrollX, scrollY);

    elements.forEach((element) => {
        const { type, x, y, width, height, strokeColor, backgroundColor, strokeWidth, roughness, opacity, points, seed } = element;

        // Set global alpha
        // Note: roughjs doesn't support global alpha directly in the config object for all shapes easily, 
        // so we might need to set ctx.globalAlpha, but roughjs resets it? 
        // Actually roughjs draws on the context.
        // Let's try setting it on context before drawing.
        // But roughjs operations might not respect it if they set their own styles.
        // Ideally we use rgba colors.

        // For now, let's just render.

        const options = {
            seed,
            stroke: strokeColor,
            strokeWidth,
            roughness,
            fill: backgroundColor !== "transparent" ? backgroundColor : undefined,
            fillStyle: "hachure", // Default fill style
        };

        switch (type) {
            case "rectangle":
                rc.rectangle(x, y, width, height, options);
                break;
            case "circle":
                // roughjs ellipse takes center x, y, width, height
                rc.ellipse(x + width / 2, y + height / 2, width, height, options);
                break;
            case "line":
            case "arrow":
                if (points && points.length > 0) {
                    // Simple line for now
                    rc.line(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y, options);
                }
                break;
            case "pencil":
                if (points && points.length > 0) {
                    const outlinePoints = getStroke(points, {
                        size: strokeWidth * 2,
                        thinning: 0.5,
                        smoothing: 0.5,
                        streamline: 0.5,
                    });

                    const pathData = getSvgPathFromStroke(outlinePoints);
                    const path = new Path2D(pathData);
                    ctx.fillStyle = strokeColor;
                    ctx.fill(path);
                }
                break;
            case "text":
                if (element.text) {
                    ctx.font = `${strokeWidth * 10}px "Architects Daughter", sans-serif`;
                    ctx.fillStyle = strokeColor;
                    ctx.fillText(element.text, x, y + height); // approximate baseline
                }
                break;
        }
    });

    // Draw selection box
    if (selection.length > 0) {
        const selectedElements = elements.filter((el) => selection.includes(el.id));
        if (selectedElements.length > 0) {
            // Calculate bounding box of all selected elements
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            selectedElements.forEach((el) => {
                // For pencil/line/arrow, we should calculate based on points, 
                // but for now using the bounding box (x, y, width, height) is a decent approximation 
                // if we keep those updated correctly.
                // However, for pencil, width/height might be 0 initially or not fully representative if not updated.
                // Assuming x,y,width,height are kept up to date.

                // Normalize for negative width/height
                const ex = el.width < 0 ? el.x + el.width : el.x;
                const ey = el.height < 0 ? el.y + el.height : el.y;
                const ew = Math.abs(el.width);
                const eh = Math.abs(el.height);

                minX = Math.min(minX, ex);
                minY = Math.min(minY, ey);
                maxX = Math.max(maxX, ex + ew);
                maxY = Math.max(maxY, ey + eh);
            });

            const margin = 8 / zoom;
            const x = minX - margin;
            const y = minY - margin;
            const width = maxX - minX + margin * 2;
            const height = maxY - minY + margin * 2;

            ctx.save();
            ctx.strokeStyle = "#3b82f6"; // blue-500
            ctx.lineWidth = 1 / zoom;
            ctx.setLineDash([5 / zoom, 5 / zoom]);
            ctx.strokeRect(x, y, width, height);
            ctx.restore();

            // Draw resize handles if only one element is selected (or maybe for group too later)
            // For now, let's show handles for the bounding box of selection
            ctx.save();
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#3b82f6";
            ctx.lineWidth = 1 / zoom;
            const handleSize = 8 / zoom;

            const handles = [
                { x: x, y: y }, // nw
                { x: x + width / 2, y: y }, // n
                { x: x + width, y: y }, // ne
                { x: x + width, y: y + height / 2 }, // e
                { x: x + width, y: y + height }, // se
                { x: x + width / 2, y: y + height }, // s
                { x: x, y: y + height }, // sw
                { x: x, y: y + height / 2 }, // w
            ];

            handles.forEach(handle => {
                ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
                ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            });
            ctx.restore();
        }
    }

    // Draw temporary selection rect (drag to select)
    if (selectionRect) {
        ctx.save();
        ctx.strokeStyle = "#3b82f6";
        ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
        ctx.lineWidth = 1 / zoom;
        ctx.fillRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
        ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
        ctx.restore();
    }

    ctx.restore();
};

// Helper for perfect-freehand
function getSvgPathFromStroke(stroke: number[][]) {
    if (!stroke.length) return "";

    const d = stroke.reduce(
        (acc, [x0, y0], i, arr) => {
            const [x1, y1] = arr[(i + 1) % arr.length];
            acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
            return acc;
        },
        ["M", ...stroke[0], "Q"]
    );

    d.push("Z");
    return d.join(" ");
}
