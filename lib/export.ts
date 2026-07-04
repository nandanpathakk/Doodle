import { Element, AppState } from "./types";
import { getSelectionBounds } from "./math";
import { renderScene } from "./render";

const PADDING = 24;

/**
 * Render the given elements to an offscreen canvas, fitted to their content
 * bounds. Used for PNG export and clipboard copy.
 */
function renderToContentCanvas(
    elements: Element[],
    isDarkMode: boolean,
    scale: number,
    background?: string
): HTMLCanvasElement | null {
    if (elements.length === 0) return null;

    const bounds = getSelectionBounds(elements);
    if (!isFinite(bounds.width) || !isFinite(bounds.height)) return null;

    const w = bounds.width + PADDING * 2;
    const h = bounds.height + PADDING * 2;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(w * scale));
    canvas.height = Math.max(1, Math.ceil(h * scale));

    const appState: AppState = {
        tool: "selection",
        selection: [],
        isDragging: false,
        zoom: scale,
        scrollX: (PADDING - bounds.x) * scale,
        scrollY: (PADDING - bounds.y) * scale,
    };

    // dpr: 1 because we bake the scale into zoom and size the canvas ourselves.
    renderScene(canvas, elements, appState, null, isDarkMode, null, { dpr: 1, background });
    return canvas;
}

function triggerDownload(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

const timestamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

export function exportToPng(elements: Element[], isDarkMode: boolean) {
    const background = isDarkMode ? "#121212" : "#ffffff";
    const canvas = renderToContentCanvas(elements, isDarkMode, 2, background);
    if (!canvas) return;
    triggerDownload(canvas.toDataURL("image/png"), `doodle-${timestamp()}.png`);
}

export async function copyPngToClipboard(elements: Element[], isDarkMode: boolean): Promise<boolean> {
    const background = isDarkMode ? "#121212" : "#ffffff";
    const canvas = renderToContentCanvas(elements, isDarkMode, 2, background);
    if (!canvas) return false;

    try {
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) return false;
        // ClipboardItem image support varies by browser; guard it.
        if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        return true;
    } catch {
        return false;
    }
}

export function saveToFile(elements: Element[]) {
    const data = JSON.stringify({ type: "doodle", version: 1, elements }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `doodle-${timestamp()}.doodle`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function loadFromFile(file: File): Promise<Element[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result));
                const elements = Array.isArray(parsed) ? parsed : parsed.elements;
                if (!Array.isArray(elements)) throw new Error("Invalid file: no elements array");
                resolve(elements as Element[]);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}
