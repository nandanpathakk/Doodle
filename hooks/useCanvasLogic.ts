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

    const getMouseCoordinates = (e: React.MouseEvent) => {
        const { clientX, clientY } = e;
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
    };
}
