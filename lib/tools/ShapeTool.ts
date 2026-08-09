import { Tool, ToolContext } from "./Tool";
import { nanoid } from "nanoid";
import { Element, ToolType } from "@/lib/types";
import { indexOnTop } from "@/lib/order";
import { useStore } from "@/store/useStore";

export class ShapeTool implements Tool {
    private currentId: string | null = null;
    private startX: number = 0;
    private startY: number = 0;

    constructor(private type: ToolType) { }

    onMouseDown(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        const { x, y, addElement, addToHistory } = context;

        this.startX = x;
        this.startY = y;
        this.currentId = nanoid();

        addToHistory();

        const style = useStore.getState().currentStyle;
        const newElement: Element = {
            id: this.currentId,
            type: this.type,
            x,
            y,
            width: 0,
            height: 0,
            strokeColor: style.strokeColor,
            backgroundColor: style.backgroundColor,
            strokeWidth: style.strokeWidth,
            roughness: style.roughness,
            opacity: style.opacity,
            strokeStyle: style.strokeStyle,
            fillStyle: style.fillStyle,
            edges: style.edges,
            points: (this.type === "line" || this.type === "arrow") ? [{ x, y }] : undefined,
            seed: Math.floor(Math.random() * 2 ** 31),
            index: indexOnTop(useStore.getState().elements),
            updatedAt: Date.now(),
            version: 1,
        };

        addElement(newElement);
    }

    onMouseMove(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        if (!this.currentId) return;

        const { x, y, updateElement } = context;
        const shift = (e as React.MouseEvent).shiftKey;

        if (this.type === "line" || this.type === "arrow") {
            let endX = x;
            let endY = y;
            if (shift) {
                // Snap to the nearest 45° angle.
                const dx = x - this.startX;
                const dy = y - this.startY;
                const dist = Math.hypot(dx, dy);
                const snapped = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
                endX = this.startX + Math.cos(snapped) * dist;
                endY = this.startY + Math.sin(snapped) * dist;
            }
            updateElement(this.currentId, {
                points: [{ x: this.startX, y: this.startY }, { x: endX, y: endY }]
            });
        } else {
            // Rectangle / circle / diamond
            let width = x - this.startX;
            let height = y - this.startY;
            if (shift) {
                // Constrain to a perfect square / circle.
                const size = Math.max(Math.abs(width), Math.abs(height));
                width = (width < 0 ? -1 : 1) * size;
                height = (height < 0 ? -1 : 1) * size;
            }
            updateElement(this.currentId, { width, height });
        }
    }

    onMouseUp(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        if (!this.currentId) return;

        const { updateElement, removeElement, setTool, setSelection } = context;

        // Read fresh store state: context.elements is a render-time snapshot and can
        // lag behind the last mousemove's update.
        const element = useStore.getState().elements.find(el => el.id === this.currentId);
        const id = this.currentId;
        this.currentId = null;
        if (!element) return;

        // A click without a drag produces a degenerate (invisible) element — discard it.
        const isDegenerate = (this.type === "line" || this.type === "arrow")
            ? !element.points || element.points.length < 2 ||
            Math.hypot(
                element.points[element.points.length - 1].x - element.points[0].x,
                element.points[element.points.length - 1].y - element.points[0].y
            ) < 2
            : Math.abs(element.width) < 2 && Math.abs(element.height) < 2;

        if (isDegenerate) {
            removeElement(id);
            setTool("selection");
            return;
        }

        // Normalize negative width/height (drawn up/left) so selection logic is simpler.
        if (this.type === "rectangle" || this.type === "circle" || this.type === "diamond") {
            const { x, y, width, height } = element;
            const newX = width < 0 ? x + width : x;
            const newY = height < 0 ? y + height : y;
            updateElement(id, { x: newX, y: newY, width: Math.abs(width), height: Math.abs(height) });
        }

        // Auto-select and switch to selection tool
        setSelection([id]);
        setTool("selection");
    }
}
