import rough from "roughjs";
import type { Element, AppState } from "./types";
import { getStroke } from "perfect-freehand";
import { getElementBounds } from "./math";
import { getTextFont, getLineBaseline, TEXT_LINE_HEIGHT } from "./text";

/**
 * Generated RoughJS shapes, reused across frames so a drag does not regenerate
 * the sketchy geometry every pointer move.
 *
 * Each canvas needs its own: entries for elements not in the list being drawn
 * are evicted, so a shared cache would have the scene and overlay layers
 * continually evicting each other's work.
 */
export type ShapeCache = Map<string, {
    version: number;
    shape?: unknown;
    path?: Path2D;
    strokeColor: string;
    backgroundColor: string;
    strokeWidth: number;
    roughness: number;
    strokeStyle?: string;
    fillStyle?: string;
    edges?: string;
    width: number;
    height: number;
    pointsLength?: number;
    relStart?: { x: number, y: number };
    relEnd?: { x: number, y: number };
    text?: string;
}>;

export const createShapeCache = (): ShapeCache => new Map();

const sceneCache: ShapeCache = createShapeCache();

/**
 * Size a full-viewport canvas's backing store to the device pixel ratio so
 * drawing stays crisp on HiDPI displays. Shared by the scene and overlay layers
 * so their coordinate spaces stay identical.
 */
export const sizeCanvasToViewport = (canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const targetW = Math.floor(w * dpr);
    const targetH = Math.floor(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
    }
};

// Draws the committed drawing and the local selection UI. Transient overlays
// (the drag-select marquee, and later remote cursors) live on the overlay
// canvas — see lib/overlay.ts.
export const renderScene = (
    canvas: HTMLCanvasElement,
    elements: Element[],
    appState: AppState,
    isDarkMode: boolean,
    editingId: string | null = null,
    renderOptions?: { dpr?: number; background?: string; cache?: ShapeCache }
) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const shapeCache = renderOptions?.cache ?? sceneCache;

    const { zoom, scrollX, scrollY, selection } = appState;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Optional solid background (used by image export).
    if (renderOptions?.background) {
        ctx.save();
        ctx.fillStyle = renderOptions.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    const rc = rough.canvas(canvas);

    // Evict cache entries for elements that no longer exist (prevents unbounded growth)
    const liveIds = new Set(elements.map((el) => el.id));
    for (const id of shapeCache.keys()) {
        if (!liveIds.has(id)) shapeCache.delete(id);
    }

    const dpr = renderOptions?.dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

    ctx.save();
    ctx.scale(dpr, dpr);
    // screen = world * zoom + scroll — must match getMouseCoordinates and the
    // zoom-at-cursor math (translate in screen space, then scale into world space).
    ctx.translate(scrollX, scrollY);
    ctx.scale(zoom, zoom);

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

        const strokeStyle = element.strokeStyle ?? "solid";
        const fillStyle = element.fillStyle ?? "hachure";
        const edges = element.edges ?? "sharp";

        const dash =
            strokeStyle === "dashed" ? [8, 8 + strokeWidth] :
                strokeStyle === "dotted" ? [1.5, 6 + strokeWidth] : undefined;

        const options: Record<string, unknown> = {
            seed,
            stroke: effectiveStrokeColor,
            strokeWidth,
            roughness,
            fill: effectiveBackgroundColor !== "transparent" ? effectiveBackgroundColor : undefined,
            fillStyle,
            strokeLineDash: dash,
        };

        // --- Cache management (reuse generated shapes across drags) ---
        let cached = shapeCache.get(element.id);
        let needsRegenerate = true;

        if (cached &&
            cached.strokeColor === effectiveStrokeColor &&
            cached.backgroundColor === effectiveBackgroundColor &&
            cached.strokeWidth === strokeWidth &&
            cached.roughness === roughness &&
            cached.strokeStyle === strokeStyle &&
            cached.fillStyle === fillStyle &&
            cached.edges === edges) {

            if (type === "rectangle" || type === "circle" || type === "diamond") {
                if (cached.width === width && cached.height === height) needsRegenerate = false;
            } else if ((type === "line" || type === "arrow" || type === "pencil") && points && points.length > 0) {
                const relStartX = points[0].x - x;
                const relStartY = points[0].y - y;
                const relEndX = points[points.length - 1].x - x;
                const relEndY = points[points.length - 1].y - y;
                if (cached.pointsLength === points.length &&
                    cached.relStart?.x === relStartX && cached.relStart?.y === relStartY &&
                    cached.relEnd?.x === relEndX && cached.relEnd?.y === relEndY) {
                    needsRegenerate = false;
                }
            }
            // text is drawn directly (not cached as a shape)
        }

        if (needsRegenerate) {
            let shape: unknown = null;
            let path: Path2D | undefined = undefined;

            // All shapes generated in element-local space (relative to x,y).
            switch (type) {
                case "rectangle":
                    // preserveVertices keeps segment endpoints exact so the straight
                    // sides and corner curves join up instead of looking patched.
                    shape = edges === "round"
                        ? generator.path(roundedRectPath(width, height), { ...options, preserveVertices: true })
                        : generator.rectangle(0, 0, width, height, options);
                    break;
                case "circle":
                    shape = generator.ellipse(width / 2, height / 2, width, height, options);
                    break;
                case "diamond":
                    shape = generator.polygon(
                        [[width / 2, 0], [width, height / 2], [width / 2, height], [0, height / 2]],
                        options
                    );
                    break;
                case "line":
                case "arrow":
                    if (points && points.length > 0) {
                        const p0 = { x: points[0].x - x, y: points[0].y - y };
                        const pN = { x: points[points.length - 1].x - x, y: points[points.length - 1].y - y };
                        shape = generator.line(p0.x, p0.y, pN.x, pN.y, options);
                    }
                    break;
                case "pencil":
                    if (points && points.length > 0) {
                        const relPoints = points.map(p => ({ x: p.x - x, y: p.y - y }));
                        const outlinePoints = getStroke(relPoints, {
                            size: strokeWidth * 2,
                            thinning: 0.5,
                            smoothing: 0.5,
                            streamline: 0.5,
                        });
                        path = new Path2D(getSvgPathFromStroke(outlinePoints));
                    }
                    break;
            }

            const relStart = (points && points.length) ? { x: points[0].x - x, y: points[0].y - y } : undefined;
            const relEnd = (points && points.length) ? { x: points[points.length - 1].x - x, y: points[points.length - 1].y - y } : undefined;

            cached = {
                version,
                shape: shape ?? undefined,
                path,
                strokeColor: effectiveStrokeColor,
                backgroundColor: effectiveBackgroundColor,
                strokeWidth,
                roughness,
                strokeStyle,
                fillStyle,
                edges,
                width,
                height,
                pointsLength: points?.length,
                relStart,
                relEnd,
                text: element.text,
            };
            shapeCache.set(element.id, cached);
        }

        // --- Draw (element-local space) ---
        const alpha = (opacity ?? 100) / 100;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);

        if (cached?.shape) rc.draw(cached.shape as Parameters<typeof rc.draw>[0]);
        if (cached?.path) {
            ctx.fillStyle = effectiveStrokeColor;
            ctx.fill(cached.path);
        }

        // Arrowhead, drawn rough to match the body (relative coords).
        if (type === "arrow" && points && points.length > 1) {
            const p0 = { x: points[0].x - x, y: points[0].y - y };
            const pN = { x: points[points.length - 1].x - x, y: points[points.length - 1].y - y };
            drawRoughArrowhead(rc, p0, pN, strokeWidth, effectiveStrokeColor, roughness, seed);
        }

        // Text (anchor at local 0,0).
        if (type === "text" && element.text && element.id !== editingId) {
            ctx.save();
            const fontSize = element.fontSize ?? 20;
            ctx.font = getTextFont(fontSize);
            const lines = element.text.split("\n");
            const lineHeight = fontSize * TEXT_LINE_HEIGHT;
            let maxLineWidth = 0;
            lines.forEach(line => { maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width); });
            const totalHeight = lines.length * lineHeight;

            let boxX = 0, boxY = 0;
            if (element.textAlign === "center") boxX = -maxLineWidth / 2;
            else if (element.textAlign === "right") boxX = -maxLineWidth;
            if (element.textBaseline === "middle") boxY = -totalHeight / 2;
            else if (element.textBaseline === "bottom") boxY = -totalHeight;

            if (element.onContainerBorder) {
                ctx.fillStyle = isDarkMode ? "#121212" : "#ffffff";
                ctx.fillRect(boxX - 4, boxY - 2, maxLineWidth + 8, totalHeight + 4);
            } else if (element.containerElementId) {
                const containerElement = elements.find(el => el.id === element.containerElementId);
                if (containerElement && containerElement.backgroundColor !== "transparent") {
                    ctx.fillStyle = getAdaptiveColor(containerElement.backgroundColor);
                    ctx.fillRect(boxX - 4, boxY - 2, maxLineWidth + 8, totalHeight + 4);
                }
            }

            ctx.fillStyle = effectiveStrokeColor;
            // Draw on the alphabetic baseline at the exact offset CSS gives the
            // editing textarea, so text doesn't move when editing ends.
            ctx.textBaseline = "alphabetic";
            ctx.textAlign = element.textAlign || "left";
            const baseline = getLineBaseline(ctx, fontSize);
            lines.forEach((line, index) => ctx.fillText(line, 0, boxY + baseline + index * lineHeight));
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
                    const b = getElementBounds(el);
                    minX = Math.min(minX, b.x);
                    minY = Math.min(minY, b.y);
                    maxX = Math.max(maxX, b.x + b.width);
                    maxY = Math.max(maxY, b.y + b.height);
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

// SVG path for a rounded rectangle in local space (handles negative w/h during drawing).
function roundedRectPath(w: number, h: number): string {
    const r = Math.min(32, Math.abs(w) / 4, Math.abs(h) / 4);
    const rx = Math.sign(w || 1) * r;
    const ry = Math.sign(h || 1) * r;
    return [
        `M ${rx} 0`,
        `L ${w - rx} 0`,
        `Q ${w} 0 ${w} ${ry}`,
        `L ${w} ${h - ry}`,
        `Q ${w} ${h} ${w - rx} ${h}`,
        `L ${rx} ${h}`,
        `Q 0 ${h} 0 ${h - ry}`,
        `L 0 ${ry}`,
        `Q 0 0 ${rx} 0`,
        "Z",
    ].join(" ");
}

// Two sketchy barbs at the arrow tip, drawn with rough so they match the body.
function drawRoughArrowhead(
    rc: ReturnType<typeof rough.canvas>,
    from: { x: number; y: number },
    to: { x: number; y: number },
    strokeWidth: number,
    stroke: string,
    roughness: number,
    seed: number
) {
    const headLen = Math.max(14, strokeWidth * 4);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const spread = Math.PI / 7;
    const x1 = to.x - headLen * Math.cos(angle - spread);
    const y1 = to.y - headLen * Math.sin(angle - spread);
    const x2 = to.x - headLen * Math.cos(angle + spread);
    const y2 = to.y - headLen * Math.sin(angle + spread);
    const opts = { stroke, strokeWidth, roughness: Math.min(roughness, 1.5), seed };
    rc.line(to.x, to.y, x1, y1, opts);
    rc.line(to.x, to.y, x2, y2, opts);
}
