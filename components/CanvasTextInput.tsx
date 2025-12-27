import { useStore } from "@/store/useStore";
import { useEffect, useRef, useMemo } from "react";

interface CanvasTextInputProps {
    textInput: { x: number; y: number; text: string; id: string };
    setTextInput: (input: { x: number; y: number; text: string; id: string } | null) => void;
}

export default function CanvasTextInput({ textInput, setTextInput }: CanvasTextInputProps) {
    const { updateElement } = useStore();
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

        // Measure text logic
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.font = "20px Architects Daughter";
            const lines = text.split("\n");
            let maxWidth = 0;
            lines.forEach(line => {
                const metrics = ctx.measureText(line);
                maxWidth = Math.max(maxWidth, metrics.width);
            });
            const lineHeight = 20 * 1.2;
            const height = lines.length * lineHeight;

            updateElement(textInput.id, { text, width: maxWidth, height });
        }
    };

    const handleTextBlur = () => {
        setTextInput(null);
    };

    const storeElement = useStore(state => state.elements.find(el => el.id === textInput.id));
    const zoom = useStore(state => state.appState.zoom);

    let styleLeft = textInput.x + "px";
    let styleTop = textInput.y + "px";
    let textAlign: "left" | "center" | "right" = "left";

    if (storeElement) {
        textAlign = storeElement.textAlign || "left";
        // The original logic for styleLeft based on textAlign was removed in the provided diff,
        // but the transform approach below handles it better.
        // if (storeElement.textAlign === "center") {
        //     styleLeft = `calc(${textInput.x}px - 50%)`;
        // } else if (storeElement.textAlign === "right") {
        //     styleLeft = `calc(${textInput.x}px - 100%)`;
        // }

        // if (storeElement.textBaseline === "middle") {
        //     styleTop = `calc(${textInput.y}px - 0.6em)`;
        // }
    }

    // Better approach: use transform for alignment
    const transformX = storeElement?.textAlign === "center" ? "-50%" : storeElement?.textAlign === "right" ? "-100%" : "0%";
    const transformY = storeElement?.textBaseline === "middle" ? "-50%" : storeElement?.textBaseline === "bottom" ? "-100%" : "0%";

    const fontSize = 20 * zoom;

    // Measure text width precisely to avoid jumps
    // We use useMemo to calculate this whenever text or zoom changes
    const measuredWidth = useMemo(() => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.font = `${fontSize}px "Architects Daughter", cursive`;
            const lines = textInput.text.split('\n');
            let maxW = 0;
            lines.forEach(line => {
                const m = ctx.measureText(line);
                maxW = Math.max(maxW, m.width);
            });
            return maxW;
        }
        return (textInput.text.length + 1) * (fontSize * 0.6); // Fallback
    }, [textInput.text, fontSize]);

    return (
        <textarea
            ref={textareaRef}
            className="fixed z-50 bg-transparent outline-none resize-none overflow-hidden whitespace-pre"
            style={{
                left: textInput.x + "px",
                top: textInput.y + "px",
                transform: `translate(${transformX}, ${transformY})`,
                width: Math.max(100 * zoom, measuredWidth + (20 * zoom)) + "px", // Exact width + buffer
                height: "auto",
                textAlign: textAlign,
                fontFamily: '"Architects Daughter", cursive',
                fontSize: `${fontSize}px`,
                lineHeight: "1.2",
                padding: "0px",
                margin: "0px",
                color: storeElement ? (storeElement.strokeColor === "transparent" ? "black" : storeElement.strokeColor) : "black",
            }}
            value={textInput.text}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            placeholder="Type here..."
            rows={1}
        />
    );
}
