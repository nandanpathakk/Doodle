"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { renderScene } from "@/lib/render";
import { Element, ToolType } from "@/lib/types";
import { nanoid } from "nanoid";
import { getElementAtPosition, getSelectionBounds, getResizeHandleAtPosition, getCursorForHandle } from "@/lib/math";
import { getInitialContent } from "@/lib/initialContent";

export default function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { elements, appState, addElement, updateElement, setSelection, addToHistory, setElements, setZoom, setScroll, setTool } = useStore();
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentId, setCurrentId] = useState<string | null>(null);
    const [hasSnapshot, setHasSnapshot] = useState(false);
    const [lastMousePos, setLastMousePos] = useState<{ x: number; y: number } | null>(null);
    const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
    const [textInput, setTextInput] = useState<{ x: number; y: number; text: string; id: string } | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [resizeHandle, setResizeHandle] = useState<string | null>(null);
    const [cursor, setCursor] = useState("default");

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

    const getMouseCoordinates = (e: React.MouseEvent) => {
        const { clientX, clientY } = e;
        return {
            x: (clientX - appState.scrollX) / appState.zoom,
            y: (clientY - appState.scrollY) / appState.zoom,
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const { clientX, clientY } = e;
        const { x, y } = getMouseCoordinates(e);
        const { tool } = appState;

        mouseDownPos.current = { x: clientX, y: clientY };

        if (isPanning || tool === "hand") {
            setLastMousePos({ x: clientX, y: clientY });
            setCursor("grabbing");
            return;
        }

        if (textInput) {
            setTextInput(null);
            return;
        }

        if (tool === "selection") {
            // Check for resize handle
            if (appState.selection.length > 0) {
                const selectedElements = elements.filter(el => appState.selection.includes(el.id));
                const bounds = getSelectionBounds(selectedElements);
                const handle = getResizeHandleAtPosition(x, y, bounds, appState.zoom);
                if (handle) {
                    setResizeHandle(handle);
                    setLastMousePos({ x, y });
                    addToHistory();
                    return;
                }
            }

            const element = getElementAtPosition(x, y, elements);
            if (element) {
                // Group selection logic
                let idsToSelect = [element.id];
                if (element.groupId) {
                    idsToSelect = elements.filter(el => el.groupId === element.groupId).map(el => el.id);
                }

                if (e.shiftKey) {
                    setSelection([...new Set([...appState.selection, ...idsToSelect])]);
                } else {
                    if (!appState.selection.includes(element.id)) {
                        setSelection(idsToSelect);
                    }
                }

                setLastMousePos({ x, y });
                setIsDrawing(true);
                setHasSnapshot(false);
            } else {
                // Start selection box
                setSelection([]);
                setSelectionRect({ x, y, width: 0, height: 0 });
            }
            return;
        }

        addToHistory();
        const id = nanoid();
        const newElement: Element = {
            id,
            type: tool,
            x,
            y,
            width: 0,
            height: 0,
            strokeColor: "#000000",
            backgroundColor: "transparent",
            strokeWidth: 2,
            roughness: 1,
            opacity: 100,
            points: (tool === "pencil" || tool === "line" || tool === "arrow") ? [{ x, y }] : undefined,
            seed: Math.floor(Math.random() * 2 ** 31),
        };

        if (tool === "text") {
            addElement(newElement);
            setTextInput({ x: clientX, y: clientY, text: "", id });
            return;
        }

        addElement(newElement);
        setCurrentId(id);
        setIsDrawing(true);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const { clientX, clientY } = e;
        const { x, y } = getMouseCoordinates(e);

        // Cursor update logic
        if (isPanning || appState.tool === "hand") {
            setCursor(e.buttons === 1 ? "grabbing" : "grab");
        } else if (appState.tool === "selection") {
            const selectedElements = elements.filter(el => appState.selection.includes(el.id));
            if (selectedElements.length > 0) {
                const bounds = getSelectionBounds(selectedElements);
                const handle = getResizeHandleAtPosition(x, y, bounds, appState.zoom);
                if (handle) {
                    setCursor(getCursorForHandle(handle));
                } else if (getElementAtPosition(x, y, elements)) {
                    setCursor("move");
                } else {
                    setCursor("default");
                }
            } else if (getElementAtPosition(x, y, elements)) {
                setCursor("move");
            } else {
                setCursor("default");
            }
        } else {
            setCursor("crosshair");
        }


        if (isPanning || appState.tool === "hand") {
            if (lastMousePos && (e.buttons === 1)) {
                const dx = clientX - lastMousePos.x;
                const dy = clientY - lastMousePos.y;
                setScroll(appState.scrollX + dx, appState.scrollY + dy);
                setLastMousePos({ x: clientX, y: clientY });
            }
            return;
        }

        // Resizing logic
        if (resizeHandle && lastMousePos) {
            const dx = x - lastMousePos.x;
            const dy = y - lastMousePos.y;

            // For now, let's just handle single element resizing to be safe and robust.
            if (appState.selection.length === 1) {
                const id = appState.selection[0];
                const el = elements.find(e => e.id === id);
                if (el) {
                    let { x: elX, y: elY, width, height } = el;

                    if (resizeHandle.includes("e")) width += dx;
                    if (resizeHandle.includes("w")) { elX += dx; width -= dx; }
                    if (resizeHandle.includes("s")) height += dy;
                    if (resizeHandle.includes("n")) { elY += dy; height -= dy; }

                    updateElement(id, { x: elX, y: elY, width, height });
                }
            }

            setLastMousePos({ x, y });
            return;
        }

        if (selectionRect) {
            setSelectionRect({
                ...selectionRect,
                width: x - selectionRect.x,
                height: y - selectionRect.y
            });
            return;
        }

        if (!isDrawing) return;

        if (appState.tool === "selection") {
            if (appState.selection.length > 0 && lastMousePos) {
                if (!hasSnapshot) {
                    addToHistory();
                    setHasSnapshot(true);
                }

                const dx = x - lastMousePos.x;
                const dy = y - lastMousePos.y;

                // Move all selected
                appState.selection.forEach(id => {
                    const el = elements.find(e => e.id === id);
                    if (el) {
                        const updates: Partial<Element> = { x: el.x + dx, y: el.y + dy };
                        if (el.points) {
                            updates.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                        }
                        updateElement(id, updates);
                    }
                });
                setLastMousePos({ x, y });
            }
            return;
        }

        if (!currentId) return;

        const element = elements.find(el => el.id === currentId);
        if (!element) return;

        if (element.type === "pencil") {
            const newPoints = [...(element.points || []), { x, y }];
            updateElement(currentId, { points: newPoints });
        } else if (element.type === "line" || element.type === "arrow") {
            const points = element.points || [];
            if (points.length === 1) {
                updateElement(currentId, { points: [...points, { x, y }] });
            } else {
                updateElement(currentId, { points: [points[0], { x, y }] });
            }
        } else {
            const width = x - element.x;
            const height = y - element.y;
            updateElement(currentId, { width, height });
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (isPanning || appState.tool === "hand") {
            setLastMousePos(null);
            setCursor("grab");
            return;
        }

        if (resizeHandle) {
            setResizeHandle(null);
            setLastMousePos(null);
            return;
        }

        if (selectionRect) {
            // Finalize selection
            // Normalize rect
            const rx = selectionRect.width < 0 ? selectionRect.x + selectionRect.width : selectionRect.x;
            const ry = selectionRect.height < 0 ? selectionRect.y + selectionRect.height : selectionRect.y;
            const rw = Math.abs(selectionRect.width);
            const rh = Math.abs(selectionRect.height);

            const selectedIds = elements.filter(el => {
                // Simple intersection check
                // This is rough. Ideally we check if element is inside or intersects.
                // Let's check if element center is inside? Or bounding box intersects.
                const ex = el.width < 0 ? el.x + el.width : el.x;
                const ey = el.height < 0 ? el.y + el.height : el.y;
                const ew = Math.abs(el.width);
                const eh = Math.abs(el.height);

                return (
                    rx < ex + ew &&
                    rx + rw > ex &&
                    ry < ey + eh &&
                    ry + rh > ey
                );
            }).map(el => el.id);

            setSelection(selectedIds);
            setSelectionRect(null);
            return;
        }

        if (currentId) {
            const element = elements.find(el => el.id === currentId);
            if (element) {
                if (element.type !== "pencil" && element.type !== "line" && element.type !== "arrow") {
                    const { x: ex, y: ey, width, height } = element;
                    const newX = width < 0 ? ex + width : ex;
                    const newY = height < 0 ? ey + height : ey;
                    const newWidth = Math.abs(width);
                    const newHeight = Math.abs(height);
                    updateElement(currentId, { x: newX, y: newY, width: newWidth, height: newHeight });
                }

                // Auto-select the drawn element and switch to selection tool
                setSelection([currentId]);
                setTool("selection");
            }
        }
        setIsDrawing(false);
        setCurrentId(null);
        setLastMousePos(null);
        mouseDownPos.current = null;
    };

    const handleDoubleClick = () => {
        setIsPanning(!isPanning);
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            const delta = -e.deltaY;
            const zoomStep = 0.1;
            const newZoom = Math.max(0.1, Math.min(5, appState.zoom + (delta > 0 ? zoomStep : -zoomStep)));
            setZoom(newZoom);
        } else {
            setScroll(appState.scrollX - e.deltaX, appState.scrollY - e.deltaY);
        }
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (!textInput) return;
        const text = e.target.value;
        setTextInput({ ...textInput, text });

        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) {
            ctx.font = "20px Architects Daughter";
            const metrics = ctx.measureText(text);
            const height = 20;
            updateElement(textInput.id, { text, width: metrics.width, height });
        }
    };

    const handleTextBlur = () => {
        setTextInput(null);
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
                <textarea
                    className="fixed z-10 bg-transparent outline-none resize-none font-hand text-xl text-black dark:text-white overflow-hidden"
                    style={{
                        left: textInput.x,
                        top: textInput.y,
                        width: Math.max(100, (textInput.text.length + 1) * 12) + "px",
                        height: "auto",
                    }}
                    value={textInput.text}
                    onChange={handleTextChange}
                    onBlur={handleTextBlur}
                    autoFocus
                    placeholder="Type here..."
                />
            )}
        </>
    );
}
