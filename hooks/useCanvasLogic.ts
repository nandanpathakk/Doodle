import { useState, useRef, useEffect, useMemo } from "react";
import { useStore } from "@/store/useStore";
import { Tool, ToolContext } from "@/lib/tools/Tool";
import { ShapeTool } from "@/lib/tools/ShapeTool";
import { PencilTool } from "@/lib/tools/PencilTool";
import { TextTool } from "@/lib/tools/TextTool";
import { SelectionTool } from "@/lib/tools/SelectionTool";
import { ToolType } from "@/lib/types";

export function useCanvasLogic() {
    const { elements, appState, addElement, updateElement, setSelection, addToHistory, setElements, setZoom, setScroll, setTool } = useStore();
    const [cursor, setCursor] = useState("default");
    const [textInput, setTextInput] = useState<{ x: number; y: number; text: string; id: string } | null>(null);
    const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef<{ x: number; y: number } | null>(null);

    const tools = useMemo(() => {
        return {
            selection: new SelectionTool(),
            rectangle: new ShapeTool("rectangle"),
            circle: new ShapeTool("circle"),
            diamond: new ShapeTool("diamond"),
            line: new ShapeTool("line"),
            arrow: new ShapeTool("arrow"),
            pencil: new PencilTool(),
            text: new TextTool(),
            hand: null, // Handled separately or as a fallback
        };
    }, []);

    const getMouseCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }
        return {
            x: (clientX - appState.scrollX) / appState.zoom,
            y: (clientY - appState.scrollY) / appState.zoom,
        };
    };

    const context: ToolContext = {
        x: 0,
        y: 0,
        elements,
        appState,
        setElements,
        updateElement,
        addElement,
        setSelection,
        setTool,
        setCursor,
        addToHistory,
        setTextInput,
        setSelectionRect,
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const { clientX, clientY } = e;
        const { x, y } = getMouseCoordinates(e);

        if (isPanning || appState.tool === "hand") {
            lastMousePos.current = { x: clientX, y: clientY };
            setCursor("grabbing");
            return;
        }

        if (textInput) {
            setTextInput(null);
            return;
        }

        const tool = tools[appState.tool as keyof typeof tools];
        if (tool) {
            tool.onMouseDown(e, { ...context, x, y });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const { clientX, clientY } = e;
        const { x, y } = getMouseCoordinates(e);

        if (isPanning || appState.tool === "hand") {
            if (lastMousePos.current && (e.buttons === 1)) {
                const dx = clientX - lastMousePos.current.x;
                const dy = clientY - lastMousePos.current.y;
                setScroll(appState.scrollX + dx, appState.scrollY + dy);
                lastMousePos.current = { x: clientX, y: clientY };
            }
            setCursor(e.buttons === 1 ? "grabbing" : "grab");
            return;
        }

        const tool = tools[appState.tool as keyof typeof tools];
        if (tool) {
            tool.onMouseMove(e, { ...context, x, y });
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        const { x, y } = getMouseCoordinates(e);

        if (isPanning || appState.tool === "hand") {
            lastMousePos.current = null;
            setCursor("grab");
            return;
        }

        const tool = tools[appState.tool as keyof typeof tools];
        if (tool) {
            tool.onMouseUp(e, { ...context, x, y });
        }
    };

    const isPinching = useRef(false);
    const lastTouchDistance = useRef<number | null>(null);

    const getDistance = (touch1: React.Touch, touch2: React.Touch) => {
        return Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
    };

    const getMidpoint = (touch1: React.Touch, touch2: React.Touch) => {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2,
        };
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            e.preventDefault(); // Prevent default zoom/scroll
            const dist = getDistance(e.touches[0], e.touches[1]);
            lastTouchDistance.current = dist;
            isPinching.current = true;
            return;
        }

        if (e.touches.length > 1) return;

        // Prevent default to avoid mouse emulation events (click, mousedown) firing after touch
        // EXCEPT for clickable elements if we were handling them natively, but we draw on canvas.
        // However, we must allow default if we want to focus inputs? No, we handle inputs manually.
        if (e.cancelable) e.preventDefault();

        const { clientX, clientY } = e.touches[0];
        const { x, y } = getMouseCoordinates(e);

        if (isPanning || appState.tool === "hand") {
            lastMousePos.current = { x: clientX, y: clientY };
            setCursor("grabbing");
            return;
        }

        if (textInput) {
            setTextInput(null);
            return;
        }

        const tool = tools[appState.tool as keyof typeof tools];
        if (tool) {
            tool.onMouseDown(e, { ...context, x, y });
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        // Handle Pinch Zoom
        if (e.touches.length === 2 && isPinching.current && lastTouchDistance.current) {
            e.preventDefault();
            const dist = getDistance(e.touches[0], e.touches[1]);
            const center = getMidpoint(e.touches[0], e.touches[1]);

            // Calculate zoom factor
            // A small change in distance should effectively zoom
            // ratio = new / old
            const zoomFactor = dist / lastTouchDistance.current;

            // Apply bounds
            const newZoom = Math.max(0.1, Math.min(5, appState.zoom * zoomFactor));

            // Calculate new scroll to keep center fixed
            // World coordinates of center before zoom
            const worldX = (center.x - appState.scrollX) / appState.zoom;
            const worldY = (center.y - appState.scrollY) / appState.zoom;

            // New scroll: client - world * newZoom
            const newScrollX = center.x - worldX * newZoom;
            const newScrollY = center.y - worldY * newZoom;

            setZoom(newZoom);
            setScroll(newScrollX, newScrollY);

            lastTouchDistance.current = dist;
            return;
        }

        if (e.touches.length > 1 || isPinching.current) return;
        // e.preventDefault(); // Prevent scrolling while drawing

        const { clientX, clientY } = e.touches[0];
        const { x, y } = getMouseCoordinates(e);

        if (isPanning || appState.tool === "hand") {
            if (lastMousePos.current) {
                const dx = clientX - lastMousePos.current.x;
                const dy = clientY - lastMousePos.current.y;
                setScroll(appState.scrollX + dx, appState.scrollY + dy);
                lastMousePos.current = { x: clientX, y: clientY };
            }
            return;
        }

        const tool = tools[appState.tool as keyof typeof tools];
        if (tool) {
            tool.onMouseMove(e, { ...context, x, y });
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (isPinching.current && e.touches.length < 2) {
            isPinching.current = false;
            lastTouchDistance.current = null;
            return;
        }

        // For touchEnd, we don't have e.touches[0] if all fingers lifted.
        // We use changedTouches[0]
        // But getMouseCoordinates expects something with touches or clientX.

        let clientX, clientY;
        if (e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            // Fallback
            return;
        }

        const x = (clientX - appState.scrollX) / appState.zoom;
        const y = (clientY - appState.scrollY) / appState.zoom;

        if (isPanning || appState.tool === "hand") {
            lastMousePos.current = null;
            setCursor("grab");
            return;
        }

        const tool = tools[appState.tool as keyof typeof tools];
        if (tool) {
            tool.onMouseUp(e, { ...context, x, y });
        }
    };

    return {
        cursor,
        textInput,
        selectionRect,
        isPanning,
        setIsPanning,
        setTextInput,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
    };
}
