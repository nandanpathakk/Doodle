"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { renderScene } from "@/lib/render";
import { getInitialContent } from "@/lib/initialContent";
import { useCanvasLogic } from "@/hooks/useCanvasLogic";
import CanvasTextInput from "./CanvasTextInput";
import ZoomIndicator from "./ZoomIndicator";
import { nanoid } from "nanoid";

export default function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { elements, appState, setElements, setZoom, setScroll } = useStore();

    const {
        cursor,
        textInput,
        selectionRect,
        isPanning,
        setIsPanning,
        setTextInput,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
    } = useCanvasLogic();

    useEffect(() => {
        if (elements.length === 0) {
            setElements(getInitialContent());
        }
    }, []);

    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
            renderScene(canvas, elements, appState, selectionRect);
        }
    }, [elements, appState, selectionRect]);

    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (canvas) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                renderScene(canvas, elements, appState, selectionRect);
            }
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [elements, appState, selectionRect]);

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

    // Grouping shortcut
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "g") {
                e.preventDefault();
                if (appState.selection.length > 1) {
                    const groupId = nanoid();
                    const updates = elements.map(el =>
                        appState.selection.includes(el.id) ? { ...el, groupId } : el
                    );
                    setElements(updates);
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [appState.selection, elements]);

    const handleDoubleClick = () => {
        setIsPanning(!isPanning);
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
                onWheel={handleWheel}
                onDoubleClick={handleDoubleClick}
            >
                Canvas not supported
            </canvas>
            {textInput && (
                <CanvasTextInput textInput={textInput} setTextInput={setTextInput} />
            )}
            <ZoomIndicator />
        </>
    );
}
