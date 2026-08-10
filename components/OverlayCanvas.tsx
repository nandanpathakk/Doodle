"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { sizeCanvasToViewport } from "@/lib/render";
import { drawOverlay, OverlayScene, Rect } from "@/lib/overlay";
import { getRemotePeers, subscribeToRoster } from "@/lib/collab/presence";

/**
 * Second canvas layer, stacked above the scene and transparent to input.
 * See lib/overlay.ts for why this is separate from the scene canvas.
 *
 * It animates with its own frame loop rather than redrawing straight from
 * props, because the collaborative build interpolates remote cursors between
 * the ~30Hz updates that arrive — that needs a frame-by-frame loop, not one
 * paint per prop change. The loop parks itself as soon as there is nothing to
 * draw, so an idle overlay costs nothing.
 */
export default function OverlayCanvas({ selectionRect }: { selectionRect: Rect | null }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const appState = useStore((s) => s.appState);
    const elements = useStore((s) => s.elements);
    const isDarkMode = useStore((s) => s.isDarkMode);

    // The loop reads the scene from a ref so that a change of props never has to
    // tear down and re-create the loop.
    const sceneRef = useRef<Omit<OverlayScene, "peers">>({ appState, selectionRect, elements, isDarkMode });
    const wakeRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let frame: number | undefined;
        let running = false;

        const tick = () => {
            sizeCanvasToViewport(canvas);
            // Peers are read straight from the presence module rather than
            // arriving as props: at ~30Hz each they would otherwise re-render
            // the app hundreds of times a second to move a few cursors.
            const peers = [...getRemotePeers().values()];
            // A final pass still runs when the scene empties, so the last
            // content is cleared before the loop parks.
            if (drawOverlay(canvas, { ...sceneRef.current, peers })) {
                frame = requestAnimationFrame(tick);
            } else {
                running = false;
                frame = undefined;
            }
        };

        const wake = () => {
            if (running) return;
            running = true;
            frame = requestAnimationFrame(tick);
        };

        wakeRef.current = wake;
        wake();

        const onResize = () => wake();
        window.addEventListener("resize", onResize);

        return () => {
            window.removeEventListener("resize", onResize);
            wakeRef.current = null;
            if (frame !== undefined) cancelAnimationFrame(frame);
        };
    }, []);

    // Publish the latest scene to the loop and restart it if parked. Done in an
    // effect rather than during render so the loop's state is never mutated
    // mid-render; the overlay is frame-driven anyway, so a frame's delay is free.
    useEffect(() => {
        sceneRef.current = { appState, selectionRect, elements, isDarkMode };
        wakeRef.current?.();
    });

    // Peers joining or leaving does not re-render this component, so the loop
    // needs waking when the roster changes or a first cursor would never appear.
    useEffect(() => subscribeToRoster(() => wakeRef.current?.()), []);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="block pointer-events-none absolute inset-0 z-[1]"
        />
    );
}
