import { useStore } from "@/store/useStore";
import { useEffect, useRef, useMemo } from "react";
import { measureTextBlock, TEXT_FONT_FAMILY, TEXT_LINE_HEIGHT } from "@/lib/text";

interface CanvasTextInputProps {
    // x/y are world coordinates; converted to screen space here so the editor
    // stays anchored to the element across pan/zoom.
    textInput: { x: number; y: number; text: string; id: string };
    setTextInput: (input: { x: number; y: number; text: string; id: string } | null) => void;
}

export default function CanvasTextInput({ textInput, setTextInput }: CanvasTextInputProps) {
    const { updateElement, removeElement } = useStore();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null); // Dummy canvas for text measurement if needed, or use existing context logic

    useEffect(() => {
        // Programmatically focus on mount to ensure it captures input
        const timeout = setTimeout(() => {
            textareaRef.current?.focus();
        }, 0);
        return () => clearTimeout(timeout);
    }, []);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        const textarea = e.target;

        // Auto-grow
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";

        setTextInput({ ...textInput, text });

        // Keep the element's box in sync with its content (world units).
        const fs = useStore.getState().elements.find(el => el.id === textInput.id)?.fontSize ?? 20;
        const { width, height } = measureTextBlock(text, fs);
        updateElement(textInput.id, { text, width, height });
    };

    const handleTextBlur = () => {
        // Don't leave invisible, hit-testable ghost elements behind.
        if (!textInput.text.trim()) {
            removeElement(textInput.id);
        }
        setTextInput(null);
    };

    const storeElement = useStore(state => state.elements.find(el => el.id === textInput.id));
    const zoom = useStore(state => state.appState.zoom);
    const scrollX = useStore(state => state.appState.scrollX);
    const scrollY = useStore(state => state.appState.scrollY);
    const isDarkMode = useStore(state => state.isDarkMode);

    const textAlign: "left" | "center" | "right" = storeElement?.textAlign || "left";

    // Use transform for alignment
    const transformX = storeElement?.textAlign === "center" ? "-50%" : storeElement?.textAlign === "right" ? "-100%" : "0%";
    const transformY = storeElement?.textBaseline === "middle" ? "-50%" : storeElement?.textBaseline === "bottom" ? "-100%" : "0%";

    const baseFontSize = storeElement?.fontSize ?? 20;
    const fontSize = baseFontSize * zoom;

    // Match the canvas renderer's dark-mode color adaptation so editing looks like the result.
    const rawColor = storeElement?.strokeColor ?? "#000000";
    const editorColor =
        rawColor === "transparent"
            ? (isDarkMode ? "#e4e4e7" : "#000000")
            : isDarkMode && rawColor === "#000000"
                ? "#e4e4e7"
                : rawColor;

    // Measure text width precisely to avoid jumps
    // We use useMemo to calculate this whenever text or zoom changes
    const measuredWidth = useMemo(
        () => measureTextBlock(textInput.text, fontSize).width,
        [textInput.text, fontSize]
    );

    return (
        <textarea
            ref={textareaRef}
            className="fixed z-50 bg-transparent outline-none resize-none overflow-hidden whitespace-pre"
            style={{
                left: textInput.x * zoom + scrollX + "px",
                top: textInput.y * zoom + scrollY + "px",
                transform: `translate(${transformX}, ${transformY})`,
                width: Math.max(100 * zoom, measuredWidth + (20 * zoom)) + "px", // Exact width + buffer
                height: "auto",
                textAlign: textAlign,
                fontFamily: TEXT_FONT_FAMILY,
                fontSize: `${fontSize}px`,
                lineHeight: String(TEXT_LINE_HEIGHT),
                padding: "0px",
                margin: "0px",
                color: editorColor,
            }}
            value={textInput.text}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            placeholder="Type here..."
            rows={1}
        />
    );
}
