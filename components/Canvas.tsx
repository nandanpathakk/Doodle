"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { renderScene, sizeCanvasToViewport } from "@/lib/render";
import { useCanvasLogic } from "@/hooks/useCanvasLogic";
import OverlayCanvas from "./OverlayCanvas";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { getElementAtPosition } from "@/lib/math";
import CanvasTextInput from "./CanvasTextInput";
import WelcomeScreen from "./WelcomeScreen";
import ZoomIndicator from "./ZoomIndicator";
import ContextMenu, { ContextMenuState } from "./ContextMenu";

export default function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Selector subscriptions: only re-render Canvas when these specific slices change
    // (avoids re-rendering on unrelated state like currentStyle or history).
    const elements = useStore((s) => s.elements);
    const appState = useStore((s) => s.appState);
    const isDarkMode = useStore((s) => s.isDarkMode);
    const setSelection = useStore((s) => s.setSelection);
    const setZoom = useStore((s) => s.setZoom);
    const setScroll = useStore((s) => s.setScroll);
    const [fontsReady, setFontsReady] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const frameRef = useRef<number | undefined>(undefined);

    const {
        cursor,
        textInput,
        selectionRect,
        setTextInput,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleDoubleClick,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
    } = useCanvasLogic();

    useKeyboardShortcuts();

    // Re-render once the hand-drawn font is loaded so text metrics are correct.
    useEffect(() => {
        const fonts = typeof document !== "undefined" ? document.fonts : undefined;
        if (!fonts) return; // no Font Loading API: metrics already usable, no re-render needed
        fonts.ready.then(() => setFontsReady(true));
    }, []);

    // Coalesce draws to one per animation frame, so a burst of store updates
    // (e.g. dragging many elements) results in a single vsync-aligned render.
    // Note `selectionRect` is absent from the dependencies: the marquee lives on
    // the overlay canvas, so dragging one no longer repaints the whole scene.
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
            sizeCanvasToViewport(canvas);
            renderScene(canvas, elements, appState, isDarkMode, textInput?.id);
        });
        return () => {
            if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
        };
    }, [elements, appState, isDarkMode, textInput, fontsReady]);

    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (canvas) {
                sizeCanvasToViewport(canvas);
                renderScene(canvas, elements, appState, isDarkMode, textInput?.id);
            }
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [elements, appState, isDarkMode, textInput]);

    // Add non-passive wheel listener to prevent browser zoom
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
            }
        };

        canvas.addEventListener("wheel", onWheel, { passive: false });
        return () => canvas.removeEventListener("wheel", onWheel);
    }, []);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        const worldX = (e.clientX - appState.scrollX) / appState.zoom;
        const worldY = (e.clientY - appState.scrollY) / appState.zoom;
        const el = getElementAtPosition(worldX, worldY, elements);
        if (el) {
            if (!appState.selection.includes(el.id)) {
                const ids = el.groupId
                    ? elements.filter((e2) => e2.groupId === el.groupId).map((e2) => e2.id)
                    : [el.id];
                setSelection(ids);
            }
        } else {
            setSelection([]);
        }
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const { clientX, clientY } = e;
            const delta = -e.deltaY;

            // Smoother zoom factor
            const zoomFactor = delta > 0 ? 1.05 : 0.95;
            const newZoom = Math.max(0.1, Math.min(5, appState.zoom * zoomFactor));

            // Calculate new scroll position to keep mouse pointer fixed
            // World coordinates of mouse before zoom
            const worldX = (clientX - appState.scrollX) / appState.zoom;
            const worldY = (clientY - appState.scrollY) / appState.zoom;

            // New scroll position: client - world * newZoom
            const newScrollX = clientX - worldX * newZoom;
            const newScrollY = clientY - worldY * newZoom;

            setZoom(newZoom);
            setScroll(newScrollX, newScrollY);
        } else {
            setScroll(appState.scrollX - e.deltaX, appState.scrollY - e.deltaY);
        }
    };

    return (
        <>
            <canvas
                ref={canvasRef}
                className="block touch-none absolute inset-0 z-0"
                style={{ cursor }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onWheel={handleWheel}
                onDoubleClick={handleDoubleClick}
                onContextMenu={handleContextMenu}
                role="application"
                aria-label="Drawing canvas"
            >
                Canvas not supported
            </canvas>
            <OverlayCanvas selectionRect={selectionRect} />
            {textInput && (
                <CanvasTextInput textInput={textInput} setTextInput={setTextInput} />
            )}
            {contextMenu && (
                <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
            )}
            {elements.length === 0 && <WelcomeScreen />}
            <ZoomIndicator />
        </>
    );
}
