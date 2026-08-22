import { Tool, ToolContext } from "./Tool";
import { getElementAtPosition } from "@/lib/math";

export class EraserTool implements Tool {
    private erasing = false;

    private eraseAt(context: ToolContext) {
        const { x, y, elements, beginGesture, removeElement } = context;
        const el = getElementAtPosition(x, y, elements);
        if (el) {
            // Only opens the gesture once, so a sweep over many elements is a
            // single undo step.
            beginGesture();
            removeElement(el.id);
        }
    }

    onMouseDown(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        this.erasing = true;
        this.eraseAt(context);
    }

    onMouseMove(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        context.setCursor("crosshair");
        if (this.erasing) this.eraseAt(context);
    }

    onMouseUp() {
        this.erasing = false;
    }
}
