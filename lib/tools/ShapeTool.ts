import { Tool, ToolContext } from "./Tool";
import { nanoid } from "nanoid";
import { Element, ToolType } from "@/lib/types";

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

        const newElement: Element = {
            id: this.currentId,
            type: this.type,
            x,
            y,
            width: 0,
            height: 0,
            strokeColor: "#000000",
            backgroundColor: "transparent",
            strokeWidth: 2,
            roughness: 1,
            opacity: 100,
            points: (this.type === "line" || this.type === "arrow") ? [{ x, y }] : undefined,
            seed: Math.floor(Math.random() * 2 ** 31),
            version: 1,
        };

        addElement(newElement);
    }

    onMouseMove(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        if (!this.currentId) return;

        const { x, y, updateElement } = context;

        if (this.type === "line" || this.type === "arrow") {
            // For line/arrow, we update the points
            // Initial implementation: just 2 points (start and current)
            // If we want multi-point lines later, we'd need different logic
            updateElement(this.currentId, {
                points: [{ x: this.startX, y: this.startY }, { x, y }]
            });
        } else {
            // For rectangle/circle
            const width = x - this.startX;
            const height = y - this.startY;
            updateElement(this.currentId, { width, height });
        }
    }

    onMouseUp(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        if (!this.currentId) return;

        const { updateElement, setTool, setSelection, elements } = context;

        // Normalize dimensions for rect/circle if needed (negative width/height)
        // But we usually keep them negative for rendering direction, 
        // however, for selection logic it's often easier to normalize.
        // The original code normalized on mouse up.

        const element = elements.find(el => el.id === this.currentId);
        if (element && (this.type === "rectangle" || this.type === "circle")) {
            const { x, y, width, height } = element;
            const newX = width < 0 ? x + width : x;
            const newY = height < 0 ? y + height : y;
            const newWidth = Math.abs(width);
            const newHeight = Math.abs(height);
            updateElement(this.currentId, { x: newX, y: newY, width: newWidth, height: newHeight });
        }

        // Auto-select and switch to selection tool
        setSelection([this.currentId]);
        setTool("selection");

        this.currentId = null;
    }
}
