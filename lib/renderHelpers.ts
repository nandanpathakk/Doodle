import { Element } from "./types";

/**
 * Draw an arrowhead at the end of a line
 */
export function drawArrowhead(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    strokeWidth: number,
    strokeColor: string
) {
    const headLength = Math.max(10, strokeWidth * 5); // Arrow head length
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.save();
    ctx.fillStyle = strokeColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;

    // Draw arrowhead as a filled triangle
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
        toX - headLength * Math.cos(angle - Math.PI / 6),
        toY - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        toX - headLength * Math.cos(angle + Math.PI / 6),
        toY - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

/**
 * Render a diamond shape using canvas path
 */
export function renderDiamond(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    strokeColor: string,
    backgroundColor: string,
    strokeWidth: number
) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;

    if (backgroundColor !== "transparent") {
        ctx.fillStyle = backgroundColor;
    }

    ctx.beginPath();
    ctx.moveTo(centerX, y); // Top
    ctx.lineTo(x + width, centerY); // Right
    ctx.lineTo(centerX, y + height); // Bottom
    ctx.lineTo(x, centerY); // Left
    ctx.closePath();

    if (backgroundColor !== "transparent") {
        ctx.fill();
    }
    ctx.stroke();

    ctx.restore();
}
