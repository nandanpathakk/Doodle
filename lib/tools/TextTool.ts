import { Tool, ToolContext } from "./Tool";
import { nanoid } from "nanoid";
import { Element } from "@/lib/types";
import { getElementAtPosition } from "@/lib/math";

export class TextTool implements Tool {
    onMouseDown(e: React.MouseEvent, context: ToolContext) {
        const { x, y, addElement, setTextInput, elements, addToHistory } = context;
        const { clientX, clientY } = e;

        // Check if clicking on an existing shape to center text
        const clickedElement = getElementAtPosition(x, y, elements);

        let textAlign: "left" | "center" | "right" = "left";
        let textBaseline: "top" | "middle" | "bottom" = "top";
        let containerElementId: string | undefined;
        let textX = x;
        let textY = y;

        if (clickedElement && (clickedElement.type === "rectangle" || clickedElement.type === "circle")) {
            // Calculate shape bounds
            const shapeX = clickedElement.width < 0 ? clickedElement.x + clickedElement.width : clickedElement.x;
            const shapeY = clickedElement.height < 0 ? clickedElement.y + clickedElement.height : clickedElement.y;
            const shapeWidth = Math.abs(clickedElement.width);
            const shapeHeight = Math.abs(clickedElement.height);

            const centerX = shapeX + shapeWidth / 2;
            const centerY = shapeY + shapeHeight / 2;

            // Determine if click is in top third or center
            const relativeY = y - shapeY;
            const isTopThird = relativeY < shapeHeight / 3;

            if (isTopThird) {
                // Top alignment
                textX = centerX;
                textY = shapeY + 10; // Small padding from top
                textAlign = "center";
                textBaseline = "top";
            } else {
                // Center alignment
                textX = centerX;
                textY = centerY;
                textAlign = "center";
                textBaseline = "middle";
            }

            containerElementId = clickedElement.id;
        }

        const id = nanoid();
        const newElement: Element = {
            id,
            type: "text",
            x: textX,
            y: textY,
            width: 0,
            height: 0,
            strokeColor: "#000000",
            backgroundColor: "transparent",
            strokeWidth: 2,
            roughness: 1,
            opacity: 100,
            text: "",
            seed: Math.floor(Math.random() * 2 ** 31),
            textAlign,
            textBaseline,
            containerElementId,
        };

        addToHistory();
        addElement(newElement);
        setTextInput({ x: clientX, y: clientY, text: "", id });
    }

    onMouseMove(e: React.MouseEvent, context: ToolContext) {
        // Text tool doesn't do anything on mouse move usually
        context.setCursor("text");
    }

    onMouseUp(e: React.MouseEvent, context: ToolContext) {
        // Nothing to do on mouse up
    }
}
