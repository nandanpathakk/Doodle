export const TEXT_LINE_HEIGHT = 1.2;
export const TEXT_FONT_FAMILY = '"Architects Daughter", cursive';

export const getTextFont = (fontSize: number) => `${fontSize}px ${TEXT_FONT_FAMILY}`;

// Shared offscreen context so measurement doesn't allocate a canvas per call.
let measureCtx: CanvasRenderingContext2D | null = null;
const getMeasureCtx = () => {
    if (!measureCtx) {
        measureCtx = document.createElement("canvas").getContext("2d");
    }
    return measureCtx;
};

/** Width/height of a text block in the same units as fontSize. */
export function measureTextBlock(text: string, fontSize: number) {
    const ctx = getMeasureCtx();
    const lines = text.split("\n");
    let width = 0;
    if (ctx) {
        ctx.font = getTextFont(fontSize);
        for (const line of lines) {
            width = Math.max(width, ctx.measureText(line).width);
        }
    } else {
        width = Math.max(...lines.map((l) => l.length)) * fontSize * 0.6; // fallback
    }
    return { width, height: lines.length * fontSize * TEXT_LINE_HEIGHT };
}

/**
 * Distance from the top of a CSS line box to the alphabetic baseline.
 *
 * CSS centers the font's content area (ascent + descent) inside the line box,
 * so glyphs sit at halfLeading + ascent. Drawing on canvas with
 * textBaseline="alphabetic" at this offset makes canvas text line up with the
 * same text in a DOM element (the editing textarea) pixel-for-pixel.
 * Expects `ctx.font` to already be set.
 */
export function getLineBaseline(ctx: CanvasRenderingContext2D, fontSize: number) {
    const m = ctx.measureText("Mg");
    const ascent = m.fontBoundingBoxAscent ?? fontSize * 0.8;
    const descent = m.fontBoundingBoxDescent ?? fontSize * 0.2;
    const lineHeight = fontSize * TEXT_LINE_HEIGHT;
    return (lineHeight - (ascent + descent)) / 2 + ascent;
}
