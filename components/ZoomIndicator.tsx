"use client";

import { useStore } from "@/store/useStore";
import { Minus, Plus } from "lucide-react";

export default function ZoomIndicator() {
    const zoom = useStore((s) => s.appState.zoom);
    const zoomIn = useStore((s) => s.zoomIn);
    const zoomOut = useStore((s) => s.zoomOut);
    const resetZoom = useStore((s) => s.resetZoom);

    return (
        <div className="fixed top-4 right-4 md:top-auto md:right-auto md:bottom-4 md:left-4 z-30 flex items-center bg-white/90 dark:bg-[#1e1e1e]/90 backdrop-blur-sm shadow-sm md:shadow-md rounded-lg border-none md:border border-zinc-200 dark:border-gray-800 select-none overflow-hidden">
            <button
                onClick={zoomOut}
                title="Zoom out (Ctrl -)"
                aria-label="Zoom out"
                className="h-8 w-8 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
                <Minus size={16} />
            </button>
            <button
                onClick={resetZoom}
                title="Reset zoom (Ctrl 0)"
                aria-label="Reset zoom to 100%"
                className="h-8 min-w-[3.25rem] px-1 flex items-center justify-center text-xs md:text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors tabular-nums"
            >
                {Math.round(zoom * 100)}%
            </button>
            <button
                onClick={zoomIn}
                title="Zoom in (Ctrl +)"
                aria-label="Zoom in"
                className="h-8 w-8 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
                <Plus size={16} />
            </button>
        </div>
    );
}
