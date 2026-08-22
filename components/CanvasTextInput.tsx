import { useStore } from "@/store/useStore";
import { useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { measureTextBlock, TEXT_FONT_FAMILY, TEXT_LINE_HEIGHT } from "@/lib/text";

export interface TextInput {
    // x/y are world coordinates; converted to screen space here so the editor
    // stays anchored to the element across pan/zoom.
    x: number;
    y: number;
    id: string;
}

interface CanvasTextInputProps {
    textInput: TextInput;
    setTextInput: (input: TextInput | null) => void;
}

/**
 * The text editor is a real `<textarea>` positioned over the canvas, so it
 * comes with a caret, selection, and IME for free.
 *
 * Its value is the element's text **in the store**, not a copy held here. That
 * matters in a session: a peer typing in the same label reaches the store
 * through the document, and an editor holding its own copy would overwrite
 * them on the next keystroke — the merge in `doc.ts` would be undone one
 * character at a time by the very thing it exists to protect.
 */
export default function CanvasTextInput({ textInput, setTextInput }: CanvasTextInputProps) {
    const { updateElement, removeElement } = useStore();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const storeElement = useStore(state => state.elements.find(el => el.id === textInput.id));
    const zoom = useStore(state => state.appState.zoom);
    const scrollX = useStore(state => state.appState.scrollX);
    const scrollY = useStore(state => state.appState.scrollY);
    const isDarkMode = useStore(state => state.isDarkMode);

    const text = storeElement?.text ?? "";

    useEffect(() => {
        // Programmatically focus on mount to ensure it captures input
        const timeout = setTimeout(() => {
            textareaRef.current?.focus();
        }, 0);
        return () => clearTimeout(timeout);
    }, []);

    const grow = (textarea: HTMLTextAreaElement) => {
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const next = e.target.value;
        grow(e.target);

        // Keep the element's box in sync with its content (world units).
        const fs = storeElement?.fontSize ?? 20;
        const { width, height } = measureTextBlock(next, fs);
        updateElement(textInput.id, { text: next, width, height });
    };

    /**
     * Bring the textarea up to date with text that arrived from someone else.
     *
     * This is why the textarea is uncontrolled. Handing React the value would
     * have it assign `node.value` on every remote keystroke, and assigning
     * `value` drops the caret at the end of the text — so a peer typing
     * anywhere in the label would keep throwing you to the end of it. Splicing
     * in only what changed and letting the browser adjust the selection itself
     * ("preserve") is the one way to keep the caret where the user put it.
     *
     * Comparing against the DOM rather than a remembered value means our own
     * keystrokes are already a no-op here: the textarea had them first.
     */
    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea || textarea.value === text) return;

        const current = textarea.value;
        const max = Math.min(current.length, text.length);
        let prefix = 0;
        while (prefix < max && current[prefix] === text[prefix]) prefix++;
        let suffix = 0;
        while (
            suffix < max - prefix &&
            current[current.length - 1 - suffix] === text[text.length - 1 - suffix]
        ) suffix++;

        textarea.setRangeText(
            text.slice(prefix, text.length - suffix), prefix, current.length - suffix, "preserve"
        );
        grow(textarea);
    }, [text]);

    const handleTextBlur = () => {
        // Don't leave invisible, hit-testable ghost elements behind.
        if (!text.trim()) {
            removeElement(textInput.id);
        }
        setTextInput(null);
    };

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
        () => measureTextBlock(text, fontSize).width,
        [text, fontSize]
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
            // Uncontrolled on purpose — see the layout effect above. The store
            // is still the source of truth; it just reaches the DOM by splice
            // rather than by assignment, so the caret survives.
            defaultValue={text}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            placeholder="Type here..."
            rows={1}
        />
    );
}
