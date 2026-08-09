import { Tool, ToolContext } from "./Tool";
import { nanoid } from "nanoid";
import { Element } from "@/lib/types";
import { getElementAtPosition, isPointOnBorder } from "@/lib/math";
import { indexOnTop } from "@/lib/order";
import { useStore } from "@/store/useStore";

export class TextTool implements Tool {
    onMouseDown(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        const { x, y, addElement, setTextInput, elements, addToHistory } = context;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        e.preventDefault(); // Prevent default to stop focus stealing

        // Check if clicking on an existing shape to center text
        const clickedElement = getElementAtPosition(x, y, elements);

        let textAlign: "left" | "center" | "right" = "left";
        let textBaseline: "top" | "middle" | "bottom" = "top";
        let containerElementId: string | undefined;
        let onContainerBorder = false;
        let textX = x;
        let textY = y;

        if (clickedElement) {
            const { x: ex, y: ey, width, height } = clickedElement;
            const x1 = Math.min(ex, ex + width);
            const y1 = Math.min(ey, ey + height);
            const x2 = Math.max(ex, ex + width);
            const y2 = Math.max(ey, ey + height);

            // Check if on border
            const onBorder = isPointOnBorder(x, y, clickedElement);

            if (onBorder) {
                onContainerBorder = true;
                containerElementId = clickedElement.id;
                textAlign = "center";
                textBaseline = "middle";
                textX = x; // Use click position
                textY = y;
            } else if (clickedElement.type === "rectangle" || clickedElement.type === "circle") {
                // ... inside logic ...
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
        }

        const id = nanoid();
        const style = useStore.getState().currentStyle;
        const newElement: Element = {
            id,
            type: "text",
            x: textX,
            y: textY,
            width: 0,
            height: 0,
            strokeColor: style.strokeColor,
            backgroundColor: "transparent",
            strokeWidth: style.strokeWidth,
            roughness: style.roughness,
            opacity: style.opacity,
            fontSize: style.fontSize,
            text: "",
            seed: Math.floor(Math.random() * 2 ** 31),
            textAlign,
            textBaseline,
            containerElementId,
            onContainerBorder,
            index: indexOnTop(elements),
            updatedAt: Date.now(),
            version: 1,
        };

        addToHistory();
        addElement(newElement);

        // World coordinates: CanvasTextInput converts to screen space on render,
        // so the editor stays anchored to the element while panning/zooming.
        setTextInput({ x: textX, y: textY, text: "", id });
    }

    onMouseMove(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        // Text tool doesn't do anything on mouse move usually
        context.setCursor("text");
    }

    onMouseUp(e: React.MouseEvent | React.TouchEvent, context: ToolContext) {
        // Nothing to do on mouse up
    }
}
