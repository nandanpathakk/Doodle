import { Tool, ToolContext } from "./Tool";
import { nanoid } from "nanoid";
import { Element } from "@/lib/types";

export class PencilTool implements Tool {
    private currentId: string | null = null;

    onMouseDown(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        const { x, y, addElement, addToHistory } = context;

        this.currentId = nanoid();
        addToHistory();

        const newElement: Element = {
            id: this.currentId,
            type: "pencil",
            x,
            y,
            width: 0,
            height: 0,
            strokeColor: "#000000",
            backgroundColor: "transparent",
            strokeWidth: 2,
            roughness: 1,
            opacity: 100,
            points: [{ x, y }],
            seed: Math.floor(Math.random() * 2 ** 31),
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
