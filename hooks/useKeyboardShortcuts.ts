import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import type { ToolType } from "@/lib/types";
import { copySelection, cutSelection, pasteClipboard, duplicateSelection, deleteSelection, selectAll } from "@/lib/actions";

// Single-key tool shortcuts (Excalidraw-style), plus numeric aliases.
const TOOL_KEYS: Record<string, ToolType> = {
    v: "selection", "1": "selection",
    r: "rectangle", "2": "rectangle",
    d: "diamond", "3": "diamond",
    o: "circle", "4": "circle",
    a: "arrow", "5": "arrow",
    l: "line", "6": "line",
    p: "pencil", "7": "pencil",
    t: "text", "8": "text",
    e: "eraser", "9": "eraser",
    h: "hand",
};

export function useKeyboardShortcuts() {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const isEditing =
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.isContentEditable);

            // While editing text, let the textarea handle everything except Escape (commit & exit).
            if (isEditing) {
                if (e.key === "Escape") (target as HTMLElement).blur();
                return;
            }

            const mod = e.ctrlKey || e.metaKey;
            const {
                appState,
                setTool,
                setSelection,
                undo,
                redo,
                group,
                ungroup,
                moveSelection,
                zoomIn,
                zoomOut,
                resetZoom,
                zoomToFit,
            } = useStore.getState();

            // --- Zoom ---
            if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomIn(); return; }
            if (mod && e.key === "-") { e.preventDefault(); zoomOut(); return; }
            if (mod && e.key === "0") { e.preventDefault(); resetZoom(); return; }
            if (e.shiftKey && e.key === "1") { e.preventDefault(); zoomToFit(); return; }

            // --- History ---
            if (mod && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
                return;
            }
            if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }

            // --- Select all ---
            if (mod && e.key.toLowerCase() === "a") {
                e.preventDefault();
                selectAll();
                return;
            }

            // --- Group / ungroup ---
            if (mod && e.key.toLowerCase() === "g") {
                e.preventDefault();
                if (e.shiftKey) ungroup(appState.selection);
                else group(appState.selection);
                return;
            }

            // --- Z-order (Ctrl+] / Ctrl+[, with Shift for front/back) ---
            if (mod && e.key === "]") {
                e.preventDefault();
                moveSelection(e.shiftKey ? "front" : "forward");
                return;
            }
            if (mod && e.key === "[") {
                e.preventDefault();
                moveSelection(e.shiftKey ? "back" : "backward");
                return;
            }

            // --- Clipboard ---
            if (mod && e.key.toLowerCase() === "c") { copySelection(); return; }
            if (mod && e.key.toLowerCase() === "x") { cutSelection(); return; }
            if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); pasteClipboard(); return; }
            if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelection(); return; }

            // --- Delete ---
            if ((e.key === "Delete" || e.key === "Backspace") && appState.selection.length > 0) {
                e.preventDefault();
                deleteSelection();
                return;
            }

            // --- Escape: deselect ---
            if (e.key === "Escape") {
                setSelection([]);
                if (appState.tool !== "selection") setTool("selection");
                return;
            }

            // --- Tool shortcuts (no modifier) ---
            if (!mod && !e.altKey) {
                const tool = TOOL_KEYS[e.key.toLowerCase()];
                if (tool) {
                    e.preventDefault();
                    setTool(tool);
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);
}
