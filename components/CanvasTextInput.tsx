import { useStore } from "@/store/useStore";
import { useEffect, useRef } from "react";

interface CanvasTextInputProps {
    textInput: { x: number; y: number; text: string; id: string };
    setTextInput: (input: { x: number; y: number; text: string; id: string } | null) => void;
}

export default function CanvasTextInput({ textInput, setTextInput }: CanvasTextInputProps) {
    const { updateElement } = useStore();
    const canvasRef = useRef<HTMLCanvasElement>(null); // Dummy canvas for text measurement if needed, or use existing context logic

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        setTextInput({ ...textInput, text });

        // We need a way to measure text here. 
        // Ideally we pass a context or use a hidden canvas.
        // For simplicity, let's create a temporary canvas.
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.font = "20px Architects Daughter";
            const metrics = ctx.measureText(text);
            const height = 20;
            updateElement(textInput.id, { text, width: metrics.width, height });
        }
    };

    const handleTextBlur = () => {
        setTextInput(null);
    };

    return (
        <textarea
            className="fixed z-10 bg-transparent outline-none resize-none font-hand text-xl text-black dark:text-white overflow-hidden"
            style={{
                left: textInput.x,
                top: textInput.y,
                width: Math.max(100, (textInput.text.length + 1) * 12) + "px",
                height: "auto",
            }}
            value={textInput.text}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            autoFocus
            placeholder="Type here..."
        />
    );
}
