import rough from "roughjs";
import { Element, AppState } from "./types";
import { getStroke } from "perfect-freehand";
import { drawArrowhead, renderDiamond } from "./renderHelpers";

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
            case "diamond":
                // Use custom diamond renderer
                renderDiamond(ctx, x, y, width, height, strokeColor, backgroundColor, strokeWidth);
                break;
            case "line":
                if (points && points.length > 0) {
                    rc.line(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y, options);
                }
                break;
            case "arrow":
                if (points && points.length > 0) {
                    // Draw line
                    rc.line(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y, options);
                    // Draw arrowhead
                    drawArrowhead(ctx, points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y, strokeWidth, strokeColor);
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
                    ctx.save();

                    // Set font
                    const fontSize = 20; // Fixed size for now
                    ctx.font = `${fontSize}px "Architects Daughter", cursive`;
                    ctx.fillStyle = strokeColor;
                    ctx.textAlign = element.textAlign || "left";
                    ctx.textBaseline = element.textBaseline || "top";

                    // If text is attached to a container, clear background behind text
                    if (element.containerElementId) {
                        const containerElement = elements.find(el => el.id === element.containerElementId);
                        if (containerElement && containerElement.backgroundColor !== "transparent") {
                            // Measure text
                            const metrics = ctx.measureText(element.text);
                            const textWidth = metrics.width;
                            const textHeight = fontSize * 1.2; // Approximate height

                            // Calculate text position based on alignment
                            let textX = x;
                            if (element.textAlign === "center") {
                                textX = x - textWidth / 2;
                            } else if (element.textAlign === "right") {
                                textX = x - textWidth;
                            }

                            let textY = y;
                            if (element.textBaseline === "middle") {
                                textY = y - textHeight / 2;
                            } else if (element.textBaseline === "bottom") {
                                textY = y - textHeight;
                            }

                            // Clear background with white rectangle
                            ctx.fillStyle = "#ffffff";
                            ctx.fillRect(textX - 4, textY - 2, textWidth + 8, textHeight + 4);

                            // Reset fill style for text
                            ctx.fillStyle = strokeColor;
                        }
                    }

                    // Draw text
                    ctx.fillText(element.text, x, y);
                    ctx.restore();
                }
                break;
        }
    });

    // Draw selection box
    if (selection.length > 0) {
        const selectedElements = elements.filter((el) => selection.includes(el.id));
        if (selectedElements.length > 0) {
            // Check if all selected elements are lines/arrows
            const allLinesOrArrows = selectedElements.every(el => el.type === "line" || el.type === "arrow");

            if (allLinesOrArrows && selectedElements.length === 1) {
                // Draw control points for line/arrow
                const element = selectedElements[0];
                if (element.points && element.points.length >= 2) {
                    const start = element.points[0];
                    const end = element.points[element.points.length - 1];
                    const middle = {
                        x: (start.x + end.x) / 2,
                        y: (start.y + end.y) / 2
                    };

                    ctx.save();
                    ctx.fillStyle = "#ffffff";
                    ctx.strokeStyle = "#3b82f6";
                    ctx.lineWidth = 2 / zoom;
                    const handleSize = 10 / zoom;

                    // Draw control points
                    [start, middle, end].forEach(point => {
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, handleSize / 2, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                    });
                    ctx.restore();
                }
            } else {
                // Draw bounding box for other elements or multi-selection
                let minX = Infinity;
                let minY = Infinity;
                let maxX = -Infinity;
                let maxY = -Infinity;

                selectedElements.forEach((el) => {
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
                ctx.strokeStyle = "#3b82f6";
                ctx.lineWidth = 1 / zoom;
                ctx.setLineDash([5 / zoom, 5 / zoom]);
                ctx.strokeRect(x, y, width, height);
                ctx.restore();

                // Draw resize handles
                ctx.save();
                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = "#3b82f6";
                ctx.lineWidth = 1 / zoom;
                const handleSize = 8 / zoom;

                const handles = [
                    { x: x, y: y },
                    { x: x + width / 2, y: y },
                    { x: x + width, y: y },
                    { x: x + width, y: y + height / 2 },
                    { x: x + width, y: y + height },
                    { x: x + width / 2, y: y + height },
                    { x: x, y: y + height },
                    { x: x, y: y + height / 2 },
                ];

                handles.forEach(handle => {
                    ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
                    ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
                });
                ctx.restore();
            }
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
