"use client";

import { useStore } from "@/store/useStore";
import { MousePointer2, Square, Circle, Diamond, Minus, ArrowRight, Pencil, Type, Undo2 as Undo, Redo2 as Redo, Hand, Trash2, FileX, Moon, Sun } from "lucide-react";
import { ToolType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function Toolbar() {
    const { appState, setTool, undo, redo, history, clearElements, removeElement, setSelection, isDarkMode, toggleDarkMode } = useStore();
    const { past, future } = history;

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
    ];

    const handleErase = () => {
        if (appState.selection.length > 0) {
            appState.selection.forEach(id => removeElement(id));
            setSelection([]);
        }
    };

    const handleClear = () => {
        if (confirm("Are you sure you want to clear all elements?")) {
            clearElements();
            setSelection([]);
        }
    };

    return (
        <>
            {/* Top Bar (Mobile & Desktop) */}
            <div className="fixed top-4 left-4 z-10 flex gap-2">
                {/* Dark Mode - Ghost Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleDarkMode}
                    className="rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    title="Toggle Theme"
                >
                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClear}
                    className="rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hidden md:flex"
                    title="Clear All"
                >
                    <FileX size={20} />
                </Button>
            </div>

            {/* Top Right Actions (Mobile only - Undo/Redo next to zoom) */}
            <div className="fixed top-4 right-20 flex gap-1 z-10 md:hidden items-center h-8">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={undo}
                    disabled={past.length === 0}
                    className="h-8 w-8 rounded-lg text-zinc-500 dark:text-zinc-400 disabled:opacity-30"
                >
                    <Undo size={18} />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={redo}
                    disabled={future.length === 0}
                    className="h-8 w-8 rounded-lg text-zinc-500 dark:text-zinc-400 disabled:opacity-30"
                >
                    <Redo size={18} />
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
                            appState.tool === tool.id
                                ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-500/30"
                                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        )}
                        title={tool.label}
                    >
                        {tool.icon}
                    </Button>
                ))}
            </div>

            {/* Desktop Actions (Undo/Redo - Top Right) */}
            <div className="hidden md:flex fixed top-4 right-4 z-10 gap-2 bg-white dark:bg-[#232329] p-1.5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
                <Button variant="ghost" size="icon" onClick={undo} disabled={past.length === 0} className="rounded-lg text-zinc-700 dark:text-zinc-200"><Undo size={20} /></Button>
                <Button variant="ghost" size="icon" onClick={redo} disabled={future.length === 0} className="rounded-lg text-zinc-700 dark:text-zinc-200"><Redo size={20} /></Button>
            </div>

            {/* Delete Button (Mobile: Bottom Right, Ghost) */}
            {(appState.selection.length > 0) && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleErase}
                    className="fixed bottom-24 right-6 md:top-4 md:right-32 md:bottom-auto h-12 w-12 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors z-20"
                >
                    <Trash2 size={24} />
                </Button>
            )}
        </>
    );
}
