import { useState, useRef, useEffect, useMemo } from "react";
import { useStore } from "@/store/useStore";
import { Tool, ToolContext } from "@/lib/tools/Tool";
import { ShapeTool } from "@/lib/tools/ShapeTool";
import { PencilTool } from "@/lib/tools/PencilTool";
import { TextTool } from "@/lib/tools/TextTool";
import { SelectionTool } from "@/lib/tools/SelectionTool";
import { EraserTool } from "@/lib/tools/EraserTool";
import { getElementAtPosition } from "@/lib/math";
import type { ToolType } from "@/lib/types";

// The cursor a tool shows when nothing more specific applies.
const baseCursorForTool = (tool: ToolType): string => {
    switch (tool) {
        case "hand": return "grab";
        case "text": return "text";
        case "selection": return "default";
        default: return "crosshair"; // drawing tools and the eraser
    }
};

export function useCanvasLogic() {
    const { elements, appState, addElement, updateElement, removeElement, setSelection, addToHistory, beginGesture, commitGesture, setElements, setZoom, setScroll, setTool } = useStore();
    // Cursor is the tool's base, unless something transient (hover over a resize
    // handle, panning, holding Space) overrides it. Deriving the base rather than
    // pushing it from an effect keeps the two from fighting over the same state.
    const [cursorOverride, setCursorOverride] = useState<string | null>(null);
    const setCursor = setCursorOverride;
    const [textInput, setTextInput] = useState<{ x: number; y: number; text: string; id: string } | null>(null);
    const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef<{ x: number; y: number } | null>(null);
    const spaceDown = useRef(false);

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
            eraser: new EraserTool(),
            hand: null, // Handled separately or as a fallback
        };
    }, []);

    // Hold Space to temporarily pan (released → back to the active tool).
    useEffect(() => {
        const isEditing = (t: EventTarget | null) => {
            const el = t as HTMLElement | null;
            return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code === "Space" && !spaceDown.current && !isEditing(e.target)) {
                e.preventDefault();
                spaceDown.current = true;
                setCursor("grab");
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code === "Space") {
                spaceDown.current = false;
                // Fall back to the active tool rather than forcing an arrow —
                // releasing Space over a drawing tool should restore its crosshair.
                setCursorOverride(null);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
        };
    }, []);

    // A gesture is bounded by a single pointer press, enforced from both ends.
    //
    // On release: window handlers run after React's, so a tool's own onMouseUp is
    // still inside the gesture, and a release outside the canvas still closes it.
    //
    // On press (capture phase, before any React handler): close anything left
    // open. Some edits open a gesture from a handler that fires *after* release —
    // onClick on a colour swatch, dblclick creating a text element — and without
    // this the stale gesture would swallow the next edit's history snapshot.
    useEffect(() => {
        const end = () => commitGesture();
        const onRelease = ["mouseup", "touchend", "touchcancel", "pointercancel", "blur"];
        onRelease.forEach((ev) => window.addEventListener(ev, end));
        window.addEventListener("pointerdown", end, true);
        return () => {
            onRelease.forEach((ev) => window.removeEventListener(ev, end));
            window.removeEventListener("pointerdown", end, true);
        };
    }, [commitGesture]);

    // Switching tools drops whatever cursor the previous tool set for itself.
    // Adjusting state during render (React's documented pattern) rather than in
    // an effect avoids a second paint showing the stale cursor. If Space is held
    // the next pointer move re-applies the grab cursor, so nothing is lost.
    const [prevTool, setPrevTool] = useState(appState.tool);
    if (prevTool !== appState.tool) {
        setPrevTool(appState.tool);
        setCursorOverride(null);
    }

    const cursor = cursorOverride ?? baseCursorForTool(appState.tool);

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
        removeElement,
        setSelection,
        setTool,
        setCursor,
        beginGesture,
        commitGesture,
        addToHistory,
        setTextInput,
        setSelectionRect,
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const { clientX, clientY } = e;
        const { x, y } = getMouseCoordinates(e);

        if (isPanning || spaceDown.current || appState.tool === "hand") {
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

        if (isPanning || spaceDown.current || appState.tool === "hand") {
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

        if (isPanning || spaceDown.current || appState.tool === "hand") {
            lastMousePos.current = null;
            // Still panning (Space held, or the hand tool) → back to "grab";
            // otherwise drop the override so the active tool's cursor returns.
            if (spaceDown.current || appState.tool === "hand") setCursor("grab");
            else setCursorOverride(null);
            return;
        }

        const tool = tools[appState.tool as keyof typeof tools];
        if (tool) {
            tool.onMouseUp(e, { ...context, x, y });
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        if (appState.tool === "hand") return;
        const { x, y } = getMouseCoordinates(e);

        // Double-click an existing text element to edit it.
        const hit = getElementAtPosition(x, y, elements);
        if (hit && hit.type === "text") {
            setSelection([]);
            addToHistory(); // snapshot pre-edit text so the edit is undoable
            setTextInput({ x: hit.x, y: hit.y, text: hit.text || "", id: hit.id });
            return;
        }

        // Otherwise create a new text element at the cursor (Excalidraw-style).
        tools.text?.onMouseDown(e, { ...context, x, y });
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
        handleDoubleClick,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
    };
}
