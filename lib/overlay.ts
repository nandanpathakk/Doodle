import { AppState } from "./types";

/**
 * The overlay is a second canvas stacked above the scene, for things that change
 * far more often than the drawing itself: the selection marquee today, and in
 * the collaborative build remote cursors, remote selections, and the in-flight
 * strokes peers are still drawing.
 *
 * Keeping them off the scene canvas matters for latency. Remote cursors arrive
 * at ~30Hz per peer; if they shared a canvas with the drawing, every one of
 * those would repaint the whole scene and re-run RoughJS shape generation.
 */

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface OverlayScene {
    appState: AppState;
    /** Marquee box while drag-selecting. */
    selectionRect: Rect | null;
}

const SELECTION_BLUE = "#3b82f6";

export const isOverlayEmpty = (scene: OverlayScene): boolean => !scene.selectionRect;

/**
 * Paint the overlay. Returns whether anything was drawn, which the render loop
 * uses to decide if it should keep animating or go back to sleep — an idle
 * overlay must not hold a rAF loop open.
 */
export const drawOverlay = (canvas: HTMLCanvasElement, scene: OverlayScene): boolean => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isOverlayEmpty(scene)) return false;

    const { zoom, scrollX, scrollY } = scene.appState;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    ctx.save();
    // Same screen = world * zoom + scroll transform as the scene canvas, so the
    // two layers stay registered while panning and zooming.
    ctx.scale(dpr, dpr);
    ctx.translate(scrollX, scrollY);
    ctx.scale(zoom, zoom);

    if (scene.selectionRect) {
        const { x, y, width, height } = scene.selectionRect;
        ctx.save();
        ctx.strokeStyle = SELECTION_BLUE;
        ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
        ctx.lineWidth = 1 / zoom;
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        ctx.restore();
    }

    ctx.restore();
    return true;
};
