import { Tool, ToolContext } from "./Tool";
import { getElementAtPosition } from "@/lib/math";

export class EraserTool implements Tool {
    private erasing = false;
    private hasSnapshot = false;

    private eraseAt(context: ToolContext) {
        const { x, y, elements, addToHistory, removeElement } = context;
        const el = getElementAtPosition(x, y, elements);
        if (el) {
            if (!this.hasSnapshot) {
                addToHistory();
                this.hasSnapshot = true;
            }
            removeElement(el.id);
        }
    }

    onMouseDown(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        this.erasing = true;
        this.hasSnapshot = false;
        this.eraseAt(context);
    }

    onMouseMove(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        context.setCursor("crosshair");
        if (this.erasing) this.eraseAt(context);
    }

    onMouseUp() {
        this.erasing = false;
        this.hasSnapshot = false;
    }
}
