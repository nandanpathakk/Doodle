import { Tool, ToolContext } from "./Tool";
import { nanoid } from "nanoid";
import { Element } from "@/lib/types";
import { indexOnTop } from "@/lib/order";
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

        const { x, y, updateElement, elements } = context;
        const element = elements.find(el => el.id === this.currentId);

        if (element && element.points) {
            const newPoints = [...element.points, { x, y }];
            updateElement(this.currentId, { points: newPoints });
        }
    }

    onMouseUp(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        if (!this.currentId) return;

        const { setTool, setSelection } = context;

        // Auto-select and switch to selection tool
        setSelection([this.currentId]);
        setTool("selection");

        this.currentId = null;
    }
}
