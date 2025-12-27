import rough from "roughjs";
import { Element, AppState } from "./types";
import { getStroke } from "perfect-freehand";
import { drawArrowhead, renderDiamond } from "./renderHelpers";

// Shape Cache
// Shape Cache
const shapeCache = new Map<string, {
    version: number;
    shape?: any;
    path?: Path2D;
    strokeColor: string;
    backgroundColor: string;
    strokeWidth: number;
    roughness: number;
    width: number;
    height: number;
    pointsLength?: number;
    relStart?: { x: number, y: number };
    relEnd?: { x: number, y: number };
    text?: string;
}>();

export const renderScene = (
    canvas: HTMLCanvasElement,
    elements: Element[],
    appState: AppState,
    selectionRect: { x: number; y: number; width: number; height: number } | null | undefined, // Relaxed type
    isDarkMode: boolean,
    editingId: string | null = null
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

    const getAdaptiveColor = (color: string) => {
        if (color === "transparent") return "transparent";
        if (isDarkMode) {
            if (color === "#000000") return "#e4e4e7"; // Softer White (Zinc-200) instead of pure white for eye comfort
            // Add other mappings if needed, but primarily we want black to be visible
        } else {
            if (color === "#ffffff") return "#18181b"; // White -> Zinc-900 (if we had white elements)
        }
        return color;
    };

    // Create generator for manual shape creation
    const generator = rough.generator();

    elements.forEach((element) => {
        const { type, x, y, width, height, strokeColor, backgroundColor, strokeWidth, roughness, opacity, points, seed, version } = element;

        const effectiveStrokeColor = getAdaptiveColor(strokeColor);
        const effectiveBackgroundColor = getAdaptiveColor(backgroundColor);

        const options = {
            seed,
            stroke: effectiveStrokeColor,
            strokeWidth,
            roughness,
            fill: effectiveBackgroundColor !== "transparent" ? effectiveBackgroundColor : undefined,
            fillStyle: "hachure",
        };

        // Cache Management
        let cached = shapeCache.get(element.id);

        let needsRegenerate = true;

        // Check cache validity using heuristics to allow reuse during drag (when version changes but shape doesn't)
        if (cached) {
            // 1. Common checks
            if (cached.strokeColor === effectiveStrokeColor &&
                cached.backgroundColor === effectiveBackgroundColor &&
                cached.strokeWidth === strokeWidth &&
                cached.roughness === roughness) {

                // 2. Type-specific checks
                if (type === "rectangle" || type === "circle" || type === "diamond") {
                    // For box shapes, if dimensions match, we can reuse even if x/y changed
                    if (cached.width === width && cached.height === height) {
                        needsRegenerate = false;
                    }
                } else if ((type === "line" || type === "arrow" || type === "pencil") && points && points.length > 0) {
                    // For point shapes, check if points moved *relative* to x,y have changed
                    // Heuristic: Check length and first/last point relative positions
                    // precise enough for dragging. Resizing/editing changes these relative values.
                    const relStartX = points[0].x - x;
                    const relStartY = points[0].y - y;
                    const relEndX = points[points.length - 1].x - x;
                    const relEndY = points[points.length - 1].y - y;

                    if (cached.pointsLength === points.length &&
                        cached.relStart?.x === relStartX && cached.relStart?.y === relStartY &&
                        cached.relEnd?.x === relEndX && cached.relEnd?.y === relEndY) {
                        needsRegenerate = false;
                    }
                } else if (type === "text") {
                    // Text re-generation is cheap-ish, but let's check version/content
                    if (cached.version === version && cached.text === element.text) {
                        needsRegenerate = false;
                    }
                }
            }
        }

        if (needsRegenerate) {
            let shape: any = null;
            let path: Path2D | undefined = undefined;

            // Relative Generation (Generate at 0,0 or relative to x,y)
            switch (type) {
                case "rectangle":
                    shape = generator.rectangle(0, 0, width, height, options);
                    break;
                case "circle":
                    // roughjs ellipse takes center. Center relative to x,y is w/2, h/2
                    shape = generator.ellipse(width / 2, height / 2, width, height, options);
                    break;
                case "diamond":
                    // Custom render function doesn't return rough shape, handled in fallback? 
                    // No, let's just make diamond dynamic for now, or cache it if we convert to path?
                    // Keep custom for now, but optimize: cache is just a marker to skip?
                    // Diamond uses context drawing. We can cache a Path2D or just draw relative.
                    // For now, let's treat diamond as always regenerate or just draw relative?
                    // Actually, renderDiamond updates context. 
                    // Let's stick to dynamic for diamond for now (it's fast canvas).
                    break;
                case "line":
                case "arrow":
                    if (points && points.length > 0) {
                        // Normalize points to be relative to element.x, element.y
                        // This is crucial for "Sticker" behavior
                        const p0 = { x: points[0].x - x, y: points[0].y - y };
                        const pN = { x: points[points.length - 1].x - x, y: points[points.length - 1].y - y };
                        shape = generator.line(p0.x, p0.y, pN.x, pN.y, options);
                    }
                    break;
                case "pencil":
                    if (points && points.length > 0) {
                        // Normalize all points
                        const relPoints = points.map(p => ({ x: p.x - x, y: p.y - y }));

                        const outlinePoints = getStroke(relPoints, {
                            size: strokeWidth * 2,
                            thinning: 0.5,
                            smoothing: 0.5,
                            streamline: 0.5,
                        });
                        const pathData = getSvgPathFromStroke(outlinePoints);
                        path = new Path2D(pathData);
                    }
                    break;
            }

            // Save to Cache
            const relStart = (points && points.length) ? { x: points[0].x - x, y: points[0].y - y } : undefined;
            const relEnd = (points && points.length) ? { x: points[points.length - 1].x - x, y: points[points.length - 1].y - y } : undefined;

            cached = {
                version,
                shape,
                path,
                strokeColor: effectiveStrokeColor,
                backgroundColor: effectiveBackgroundColor,
                strokeWidth,
                roughness,
                width,
                height,
                pointsLength: points?.length,
                relStart,
                relEnd,
                text: element.text
            };
            shapeCache.set(element.id, cached);
        }

        // Draw Cached (or fresh) Shape
        // Apply Translation for Relative Drawing
        ctx.save();
        ctx.translate(x, y);

        if (cached && (cached.shape || cached.path)) {
            if (cached.shape) {
                rc.draw(cached.shape);
            }
            if (cached.path) {
                ctx.fillStyle = effectiveStrokeColor;
                ctx.fill(cached.path);
            }
        } else {
            // Fallbacks for custom implementations that require absolute global coords or special context
            // (Diamond, Text, ArrowHead)
            // Note: Since we translated ctx by (x,y), we must draw at (0,0) or relative offsets.

            ctx.translate(-x, -y); // Undo translation for legacy/absolute renderers if needed?
            // Actually, it's better to adapt them to relative.

            // ... But refactoring everything might be risky.
            // Let's Restore context to Absolute for Fallbacks to be safe.
            ctx.restore();

            // NEW CONTEXT for Absolute Rendering
            ctx.save();

            switch (type) {
                case "diamond":
                    renderDiamond(ctx, x, y, width, height, effectiveStrokeColor, effectiveBackgroundColor, strokeWidth);
                    break;
                case "arrow":
                    // Arrowhead (cached line is drawn above, but head is separate)
                    // Head needs to be drawn. 
                    if (points && points.length > 0) {
                        drawArrowhead(ctx, points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y, strokeWidth, effectiveStrokeColor);
                    }
                    break;
                case "text":
                    // Text Logic (Absolute)
                    if (element.text) {
                        ctx.save();
                        const fontSize = 20;
                        ctx.font = `${fontSize}px "Architects Daughter", cursive`;
                        ctx.fillStyle = effectiveStrokeColor;
                        const lines = element.text.split("\n");
                        const lineHeight = fontSize * 1.2;
                        let maxLineWidth = 0;
                        lines.forEach(line => {
                            const lineMetrics = ctx.measureText(line);
                            maxLineWidth = Math.max(maxLineWidth, lineMetrics.width);
                        });
                        const totalHeight = lines.length * lineHeight;
                        let boxX = x;
                        let boxY = y;
                        if (element.textAlign === "center") {
                            boxX = x - maxLineWidth / 2;
                        } else if (element.textAlign === "right") {
                            boxX = x - maxLineWidth;
                        }
                        if (element.textBaseline === "middle") {
                            boxY = y - totalHeight / 2;
                        } else if (element.textBaseline === "bottom") {
                            boxY = y - totalHeight;
                        }
                        if (element.onContainerBorder) {
                            const eraserColor = isDarkMode ? "#121212" : "#ffffff";
                            ctx.fillStyle = eraserColor;
                            ctx.fillRect(boxX - 4, boxY - 2, maxLineWidth + 8, totalHeight + 4);
                        } else if (element.containerElementId) {
                            const containerElement = elements.find(el => el.id === element.containerElementId);
                            if (containerElement && containerElement.backgroundColor !== "transparent") {
                                const containerBg = getAdaptiveColor(containerElement.backgroundColor);
                                ctx.fillStyle = containerBg;
                                ctx.fillRect(boxX - 4, boxY - 2, maxLineWidth + 8, totalHeight + 4);
                            }
                        }
                        ctx.fillStyle = effectiveStrokeColor;
                        ctx.textBaseline = "top";
                        ctx.textAlign = element.textAlign || "left";
                        if (element.id !== editingId) {
                            lines.forEach((line, index) => {
                                ctx.fillText(line, x, boxY + index * lineHeight);
                            });
                        }
                        ctx.restore();
                    }
                    break;
            }

            // dummy save to match indentation
            ctx.save();
            ctx.restore();
        }

        ctx.restore();
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
