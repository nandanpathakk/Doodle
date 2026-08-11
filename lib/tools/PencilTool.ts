import { Tool, ToolContext } from "./Tool";
import { nanoid } from "nanoid";
import type { Element } from "@/lib/types";
import { indexOnTop } from "@/lib/order";
import { simplifyPoints, strokeTolerance } from "@/lib/simplify";
import { useStore } from "@/store/useStore";

export class PencilTool implements Tool {
    private currentId: string | null = null;

    onMouseDown(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        const { x, y, addElement, beginGesture } = context;

        this.currentId = nanoid();
        beginGesture();

        const style = useStore.getState().currentStyle;
        const newElement: Element = {
            id: this.currentId,
            type: "pencil",
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
            points: [{ x, y }],
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
        // Read the store rather than the render-time snapshot in `context`.
        // This is the one tool that appends to what it already wrote, so a
        // stale read silently drops points: two pointer moves without a React
        // commit between them would each append to the same older array and
        // the first of the two would be lost. Every other tool recomputes from
        // the start point and the current position, where a stale snapshot
        // costs nothing.
        const element = useStore.getState().elements.find(el => el.id === this.currentId);

        if (element && element.points) {
            const newPoints = [...element.points, { x, y }];
            updateElement(this.currentId, { points: newPoints });
        }
    }

    onMouseUp(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        if (!this.currentId) return;

        const { setTool, setSelection, updateElement } = context;

        // Thin the stroke down to the points that describe it, now that it is
        // finished. Deliberately here and not in onMouseMove: the live stroke
        // stays exactly as drawn, and this runs before the gesture closes, so
        // what reaches the document and the other peers is the thinned version
        // rather than the several hundred points the pointer produced.
        const { elements, appState } = useStore.getState();
        const element = elements.find((el) => el.id === this.currentId);
        if (element?.points && element.points.length > 2) {
            const points = simplifyPoints(element.points, strokeTolerance(appState.zoom));
            if (points.length < element.points.length) updateElement(this.currentId, { points });
        }

        // Auto-select and switch to selection tool
        setSelection([this.currentId]);
        setTool("selection");

        this.currentId = null;
    }
}
