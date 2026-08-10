import type { AppState, Element } from "./types";
import type { Peer } from "./collab/presence";
import { getElementBounds } from "./math";
import { renderScene, createShapeCache } from "./render";

/**
 * The overlay is a second canvas stacked above the scene, for things that change
 * far more often than the drawing itself: the selection marquee, and the remote
 * cursors and selections of everyone else in the room.
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
    isDarkMode: boolean;
    /** Marquee box while drag-selecting. */
    selectionRect: Rect | null;
    /** Needed to outline what peers have selected. */
    elements: Element[];
    peers: Peer[];
}

const SELECTION_BLUE = "#3b82f6";
const LABEL_FONT = '500 12px ui-sans-serif, system-ui, -apple-system, sans-serif';

/**
 * How far a cursor moves toward its target each frame.
 *
 * Positions arrive at ~30Hz but the display refreshes at 60–120Hz, so drawing
 * them raw looks stepped. Easing toward the target costs nothing and is the
 * difference between a cursor that glides and one that teleports.
 */
const CURSOR_EASING = 0.28;

/** Where each peer's cursor is currently drawn, as opposed to where it is. */
const drawnCursors = new Map<number, { x: number; y: number }>();

/** Separate from the scene's cache — see ShapeCache in lib/render.ts. */
const draftCache = createShapeCache();

export const isOverlayEmpty = (scene: OverlayScene): boolean =>
    !scene.selectionRect && scene.peers.length === 0;

/**
 * Elements peers are mid-gesture on, drawn beneath everything else so they read
 * as part of the drawing rather than as decoration.
 *
 * A draft is suppressed once an element of the same id exists locally: the
 * gesture has been committed and the real element is on the scene canvas, so
 * continuing to draw the draft would double it up for a frame.
 */
const peerDrafts = (scene: OverlayScene): Element[] => {
    const existing = new Set(scene.elements.map((el) => el.id));
    const drafts: Element[] = [];
    for (const peer of scene.peers) {
        if (!peer.draft) continue;
        for (const element of peer.draft) {
            if (!element.isDeleted && !existing.has(element.id)) drafts.push(element);
        }
    }
    return drafts;
};

const drawSelectionMarquee = (ctx: CanvasRenderingContext2D, rect: Rect, zoom: number) => {
    ctx.save();
    ctx.strokeStyle = SELECTION_BLUE;
    ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
    ctx.lineWidth = 1 / zoom;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
};

/**
 * Outline what each peer has selected, in their colour. Drawn per element
 * rather than as one combined box, so it reads as "they have those two" rather
 * than "they have this region".
 */
const drawPeerSelections = (
    ctx: CanvasRenderingContext2D,
    peers: Peer[],
    elements: Element[],
    zoom: number
) => {
    const byId = new Map(elements.map((el) => [el.id, el]));

    for (const peer of peers) {
        if (peer.selection.length === 0) continue;
        ctx.save();
        ctx.strokeStyle = peer.color;
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.globalAlpha = 0.9;

        const padding = 4 / zoom;
        for (const id of peer.selection) {
            const element = byId.get(id);
            if (!element) continue; // selected something we have not received yet
            const b = getElementBounds(element);
            ctx.strokeRect(b.x - padding, b.y - padding, b.width + padding * 2, b.height + padding * 2);
        }
        ctx.restore();
    }
};

/** A cursor arrow with the peer's name beside it, in screen space. */
const drawCursor = (ctx: CanvasRenderingContext2D, x: number, y: number, peer: Peer) => {
    ctx.save();
    ctx.translate(x, y);

    // Pointer.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 15);
    ctx.lineTo(4, 11.5);
    ctx.lineTo(6.7, 17);
    ctx.lineTo(9, 15.9);
    ctx.lineTo(6.4, 10.6);
    ctx.lineTo(11, 10.3);
    ctx.closePath();
    ctx.fillStyle = peer.color;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fill();

    // Name label.
    ctx.font = LABEL_FONT;
    const label = peer.name;
    const textWidth = ctx.measureText(label).width;
    const padX = 7;
    const boxW = textWidth + padX * 2;
    const boxH = 20;
    const boxX = 13;
    const boxY = 12;

    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 5);
    ctx.fillStyle = peer.color;
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, boxX + padX, boxY + boxH / 2 + 0.5);

    ctx.restore();
};

const drawPeerCursors = (ctx: CanvasRenderingContext2D, scene: OverlayScene) => {
    const { zoom, scrollX, scrollY } = scene.appState;
    const live = new Set<number>();

    for (const peer of scene.peers) {
        if (!peer.cursor) continue;
        live.add(peer.clientId);

        // World to screen; cursors are drawn unscaled so they stay a constant
        // size however far the canvas is zoomed.
        const targetX = peer.cursor.x * zoom + scrollX;
        const targetY = peer.cursor.y * zoom + scrollY;

        const previous = drawnCursors.get(peer.clientId);
        // A peer appearing for the first time starts where they are, rather than
        // sliding in from wherever the last peer happened to be.
        const next = previous
            ? {
                x: previous.x + (targetX - previous.x) * CURSOR_EASING,
                y: previous.y + (targetY - previous.y) * CURSOR_EASING,
            }
            : { x: targetX, y: targetY };

        drawnCursors.set(peer.clientId, next);
        drawCursor(ctx, next.x, next.y, peer);
    }

    // Forget peers who left or moved off-canvas, so returning does not animate
    // from a stale position.
    for (const clientId of [...drawnCursors.keys()]) {
        if (!live.has(clientId)) drawnCursors.delete(clientId);
    }
};

/**
 * Paint the overlay. Returns whether anything was drawn, which the render loop
 * uses to decide if it should keep animating or go back to sleep — an idle
 * overlay must not hold a rAF loop open.
 */
export const drawOverlay = (canvas: HTMLCanvasElement, scene: OverlayScene): boolean => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    if (isOverlayEmpty(scene)) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawnCursors.clear();
        return false;
    }

    const { zoom, scrollX, scrollY } = scene.appState;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    // renderScene clears the canvas itself, so it goes first and everything
    // below draws on top. Its own cache keeps the two layers from evicting each
    // other's generated shapes every frame.
    const drafts = peerDrafts(scene);
    if (drafts.length > 0) {
        renderScene(canvas, drafts, { ...scene.appState, selection: [] }, scene.isDarkMode, null, {
            cache: draftCache,
        });
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // World space: same screen = world * zoom + scroll transform as the scene
    // canvas, so the two layers stay registered while panning and zooming.
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(scrollX, scrollY);
    ctx.scale(zoom, zoom);

    if (scene.selectionRect) drawSelectionMarquee(ctx, scene.selectionRect, zoom);
    drawPeerSelections(ctx, scene.peers, scene.elements, zoom);

    ctx.restore();

    // Screen space, for anything that should not scale with zoom.
    ctx.save();
    ctx.scale(dpr, dpr);
    drawPeerCursors(ctx, scene);
    ctx.restore();

    return true;
};
