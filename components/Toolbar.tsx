"use client";

import { useStore } from "@/store/useStore";
import { MousePointer2, Square, Circle, Diamond, Minus, ArrowRight, Pencil, Type, Eraser, Undo2 as Undo, Redo2 as Redo, Hand, Trash2, FileX, Moon, Sun } from "lucide-react";
import { ToolType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import MainMenu from "@/components/MainMenu";
import { deleteSelection } from "@/lib/actions";

export default function Toolbar() {
    // Granular selectors so the toolbar doesn't re-render while elements are being dragged.
    const activeTool = useStore((s) => s.appState.tool);
    const selectionCount = useStore((s) => s.appState.selection.length);
    const pastLen = useStore((s) => s.history.past.length);
    const futureLen = useStore((s) => s.history.future.length);
    const isDarkMode = useStore((s) => s.isDarkMode);
    const setTool = useStore((s) => s.setTool);
    const undo = useStore((s) => s.undo);
    const redo = useStore((s) => s.redo);
    const clearElements = useStore((s) => s.clearElements);
    const setSelection = useStore((s) => s.setSelection);
    const addToHistory = useStore((s) => s.addToHistory);
    const toggleDarkMode = useStore((s) => s.toggleDarkMode);

    const tools: { id: ToolType; icon: React.ReactNode; label: string }[] = [
        { id: "selection", icon: <MousePointer2 size={20} />, label: "Select" },
        { id: "hand", icon: <Hand size={20} />, label: "Pan" },
        { id: "rectangle", icon: <Square size={20} />, label: "Rectangle" },
        { id: "circle", icon: <Circle size={20} />, label: "Circle" },
        { id: "diamond", icon: <Diamond size={20} />, label: "Diamond" },
        { id: "line", icon: <Minus size={20} />, label: "Line" },
        { id: "arrow", icon: <ArrowRight size={20} />, label: "Arrow" },
        { id: "pencil", icon: <Pencil size={20} />, label: "Pencil" },
        { id: "text", icon: <Type size={20} />, label: "Text" },
        { id: "eraser", icon: <Eraser size={20} />, label: "Eraser" },
    ];

    const handleErase = () => {
        deleteSelection(); // routes through history
    };

    const handleClear = () => {
        if (confirm("Are you sure you want to clear all elements?")) {
            addToHistory(); // make "Clear all" undoable
            clearElements();
            setSelection([]);
        }
    };

    return (
        <>
            {/* Top Bar (Mobile & Desktop) */}
            <div className="fixed top-4 left-4 z-20 flex gap-2">
                <MainMenu />
                {/* Dark Mode - Ghost Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleDarkMode}
                    className="rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    title="Toggle Theme"
                    aria-label="Toggle theme"
                >
                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClear}
                    className="rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hidden md:flex"
                    title="Clear All"
                    aria-label="Clear all"
                >
                    <FileX size={20} />
                </Button>

                {/* Mobile-only undo/redo (kept in the same flex cluster to avoid overlap) */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={undo}
                    disabled={pastLen === 0}
                    className="rounded-lg text-zinc-500 dark:text-zinc-400 disabled:opacity-30 md:hidden"
                    title="Undo"
                    aria-label="Undo"
                >
                    <Undo size={20} />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={redo}
                    disabled={futureLen === 0}
                    className="rounded-lg text-zinc-500 dark:text-zinc-400 disabled:opacity-30 md:hidden"
                    title="Redo"
                    aria-label="Redo"
                >
                    <Redo size={20} />
                </Button>
            </div>

            {/* Main Toobar (Bottom Center on Mobile, Top Center on Desktop) */}
            <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 md:top-4 md:bottom-auto bg-white dark:bg-[#232329] shadow-xl rounded-2xl p-1.5 flex gap-1 z-10 border border-gray-100 dark:border-gray-800 max-w-[calc(100vw-2rem)] overflow-x-auto scrollbar-hide">
                {tools.map((tool) => (
                    <Button
                        key={tool.id}
                        variant="ghost"
                        size="icon"
                        onClick={() => setTool(tool.id)}
                        className={cn(
                            "rounded-xl transition-all active:scale-95",
                            activeTool === tool.id
                                ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-500/30"
                                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        )}
                        title={tool.label}
                        aria-label={tool.label}
                        aria-pressed={activeTool === tool.id}
                    >
                        {tool.icon}
                    </Button>
                ))}
            </div>

            {/* Desktop Actions (Undo/Redo - Top Right) */}
            <div className="hidden md:flex fixed top-4 right-4 z-10 gap-2 bg-white dark:bg-[#232329] p-1.5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
                <Button variant="ghost" size="icon" onClick={undo} disabled={pastLen === 0} aria-label="Undo" className="rounded-lg text-zinc-700 dark:text-zinc-200"><Undo size={20} /></Button>
                <Button variant="ghost" size="icon" onClick={redo} disabled={futureLen === 0} aria-label="Redo" className="rounded-lg text-zinc-700 dark:text-zinc-200"><Redo size={20} /></Button>
            </div>

            {/* Delete Button (Mobile: Bottom Right, Ghost) */}
            {(selectionCount > 0) && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleErase}
                    title="Delete selection"
                    aria-label="Delete selection"
                    className="fixed bottom-24 right-6 md:top-4 md:right-32 md:bottom-auto h-12 w-12 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors z-20"
                >
                    <Trash2 size={24} />
                </Button>
            )}
        </>
    );
}
