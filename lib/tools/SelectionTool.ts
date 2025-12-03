import { Tool, ToolContext } from "./Tool";
import { getElementAtPosition, getSelectionBounds, getResizeHandleAtPosition, getCursorForHandle, getLineControlPoint } from "@/lib/math";
import { Element, AppState } from "@/lib/types";

export class SelectionTool implements Tool {
    private isDragging = false;
    private isResizing = false;
    private isSelecting = false;
    private isDraggingControlPoint = false;

    private lastMousePos: { x: number; y: number } | null = null;
    private selectionRect: { x: number; y: number; width: number; height: number } | null = null;
    private resizeHandle: string | null = null;
    private lineControlPoint: "start" | "middle" | "end" | null = null;
    private hasSnapshot = false;

    // We need to expose selectionRect to the canvas for rendering
    // But the tool interface doesn't support returning state.
    // For now, we might need to add setSelectionRect to context or handle it differently.
    // Let's assume we add setSelectionRect to context.

    onMouseDown(e: React.MouseEvent, context: ToolContext) {
        const { x, y, elements, appState, setSelection, addToHistory, setSelectionRect: setContextSelectionRect } = context as any; // Cast to any to access new context props
        // Note: We need to update ToolContext to include setSelectionRect

        this.lastMousePos = { x, y };
        this.hasSnapshot = false;

        // 1. Check for line/arrow control points
        if (appState.selection.length === 1) {
            const selectedElement = elements.find((el: Element) => el.id === appState.selection[0]);
            if (selectedElement && (selectedElement.type === "line" || selectedElement.type === "arrow")) {
                const controlPoint = getLineControlPoint(x, y, selectedElement, appState.zoom);
                if (controlPoint) {
                    this.lineControlPoint = controlPoint;
                    this.isDraggingControlPoint = true;
                    addToHistory();
                    return;
                }
            }
        }

        // 2. Check for resize handle
        if (appState.selection.length > 0) {
            const selectedElements = elements.filter((el: Element) => appState.selection.includes(el.id));
            const allLinesOrArrows = selectedElements.every((el: Element) => el.type === "line" || el.type === "arrow");

            if (!allLinesOrArrows) {
                const bounds = getSelectionBounds(selectedElements);
                const handle = getResizeHandleAtPosition(x, y, bounds, appState.zoom);
                if (handle) {
                    this.resizeHandle = handle;
                    this.isResizing = true;
                    addToHistory();
                    return;
                }
            }
        }

        // 3. Check for element selection / dragging
        const element = getElementAtPosition(x, y, elements);
        if (element) {
            let idsToSelect = [element.id];
            if (element.groupId) {
                idsToSelect = elements.filter((el: Element) => el.groupId === element.groupId).map((el: Element) => el.id);
            }

            if (e.shiftKey) {
                setSelection([...new Set([...appState.selection, ...idsToSelect])]);
            } else {
                if (!appState.selection.includes(element.id)) {
                    setSelection(idsToSelect);
                }
            }

            this.isDragging = true;
        } else {
            // 4. Start selection box
            setSelection([]);
            this.selectionRect = { x, y, width: 0, height: 0 };
            this.isSelecting = true;
            if (setContextSelectionRect) setContextSelectionRect(this.selectionRect);
        }
    }

    onMouseMove(e: React.MouseEvent, context: ToolContext) {
        const { x, y, elements, appState, updateElement, setCursor, addToHistory, setSelectionRect: setContextSelectionRect } = context as any;

        // Cursor logic
        this.updateCursor(x, y, elements, appState, setCursor);

        if (!this.lastMousePos) return;

        const dx = x - this.lastMousePos.x;
        const dy = y - this.lastMousePos.y;

        if (this.isDraggingControlPoint && this.lineControlPoint && appState.selection.length === 1) {
            const id = appState.selection[0];
            const el = elements.find((e: Element) => e.id === id);
            if (el && el.points && el.points.length >= 2) {
                const newPoints = [...el.points];
                if (this.lineControlPoint === "start") {
                    newPoints[0] = { x: newPoints[0].x + dx, y: newPoints[0].y + dy };
                } else if (this.lineControlPoint === "end") {
                    newPoints[newPoints.length - 1] = {
                        x: newPoints[newPoints.length - 1].x + dx,
                        y: newPoints[newPoints.length - 1].y + dy
                    };
                } else if (this.lineControlPoint === "middle") {
                    newPoints[0] = { x: newPoints[0].x + dx, y: newPoints[0].y + dy };
                    newPoints[newPoints.length - 1] = {
                        x: newPoints[newPoints.length - 1].x + dx,
                        y: newPoints[newPoints.length - 1].y + dy
                    };
                }
                updateElement(id, { points: newPoints });
            }
        } else if (this.isResizing && this.resizeHandle) {
            if (appState.selection.length === 1) {
                const id = appState.selection[0];
                const el = elements.find((e: Element) => e.id === id);
                if (el) {
                    let { x: elX, y: elY, width, height } = el;
                    if (this.resizeHandle.includes("e")) width += dx;
                    if (this.resizeHandle.includes("w")) { elX += dx; width -= dx; }
                    if (this.resizeHandle.includes("s")) height += dy;
                    if (this.resizeHandle.includes("n")) { elY += dy; height -= dy; }
                    updateElement(id, { x: elX, y: elY, width, height });
                }
            }
        } else if (this.isDragging) {
            if (!this.hasSnapshot) {
                addToHistory();
                this.hasSnapshot = true;
            }
            appState.selection.forEach((id: string) => {
                const el = elements.find((e: Element) => e.id === id);
                if (el) {
                    const updates: Partial<Element> = { x: el.x + dx, y: el.y + dy };
                    if (el.points) {
                        updates.points = el.points.map((p: any) => ({ x: p.x + dx, y: p.y + dy }));
                    }
                    updateElement(id, updates);
                }
            });
        } else if (this.isSelecting && this.selectionRect) {
            this.selectionRect = {
                ...this.selectionRect,
                width: x - this.selectionRect.x,
                height: y - this.selectionRect.y
            };
            if (setContextSelectionRect) setContextSelectionRect(this.selectionRect);
        }

        this.lastMousePos = { x, y };
    }

    onMouseUp(e: React.MouseEvent, context: ToolContext) {
        const { elements, setSelection, setSelectionRect: setContextSelectionRect } = context as any;

        if (this.isSelecting && this.selectionRect) {
            const rx = this.selectionRect.width < 0 ? this.selectionRect.x + this.selectionRect.width : this.selectionRect.x;
            const ry = this.selectionRect.height < 0 ? this.selectionRect.y + this.selectionRect.height : this.selectionRect.y;
            const rw = Math.abs(this.selectionRect.width);
            const rh = Math.abs(this.selectionRect.height);

            const selectedIds = elements.filter((el: Element) => {
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
            }).map((el: Element) => el.id);

            setSelection(selectedIds);
            if (setContextSelectionRect) setContextSelectionRect(null);
        }

        this.isDragging = false;
        this.isResizing = false;
        this.isSelecting = false;
        this.isDraggingControlPoint = false;
        this.lastMousePos = null;
        this.selectionRect = null;
        this.resizeHandle = null;
        this.lineControlPoint = null;
    }

    private updateCursor(x: number, y: number, elements: Element[], appState: AppState, setCursor: (c: string) => void) {
        const selectedElements = elements.filter(el => appState.selection.includes(el.id));

        if (selectedElements.length === 1 && (selectedElements[0].type === "line" || selectedElements[0].type === "arrow")) {
            const controlPoint = getLineControlPoint(x, y, selectedElements[0], appState.zoom);
            if (controlPoint) {
                setCursor(controlPoint === "middle" ? "move" : "crosshair");
                return;
            }
        }

        if (selectedElements.length > 0) {
            const allLinesOrArrows = selectedElements.every(el => el.type === "line" || el.type === "arrow");
            if (!allLinesOrArrows) {
                const bounds = getSelectionBounds(selectedElements);
                const handle = getResizeHandleAtPosition(x, y, bounds, appState.zoom);
                if (handle) {
                    setCursor(getCursorForHandle(handle));
                    return;
                }
            }
        }

        const hoveredElement = getElementAtPosition(x, y, elements);
        if (hoveredElement) {
            setCursor("move");
        } else {
            setCursor("default");
        }
    }
}
