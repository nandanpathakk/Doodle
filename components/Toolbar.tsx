"use client";

import { useStore } from "@/store/useStore";
import { MousePointer2, Square, Circle, Diamond, Minus, ArrowRight, Pencil, Type, Undo2 as Undo, Redo2 as Redo, Hand } from "lucide-react";
import { ToolType } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Toolbar() {
    const { appState, setTool, undo, redo, history } = useStore();
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

    return (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-white dark:bg-zinc-800 shadow-lg rounded-lg p-2 flex gap-1 z-10">
            {tools.map((tool) => (
                <button
                    key={tool.id}
                    onClick={() => setTool(tool.id)}
                    className={`p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors ${appState.tool === tool.id ? "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300" : ""
                        }`}
                    title={tool.label}
                >
                    {tool.icon}
                </button>
            ))}
            <div className="w-px bg-zinc-300 dark:bg-zinc-600 mx-1" />
            <button
                onClick={undo}
                disabled={past.length === 0}
                className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo"
            >
                <Undo size={20} />
            </button>
            <button
                onClick={redo}
                disabled={future.length === 0}
                className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo"
            >
                <Redo size={20} />
            </button>
        </div>
    );
}
