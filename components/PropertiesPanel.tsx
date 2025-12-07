"use client";

import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";

const colors = ["#000000", "#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "transparent"];

export default function PropertiesPanel() {
    const { elements, appState, updateElement, isDarkMode } = useStore();

    if (appState.selection.length === 0) return null;

    const selectedId = appState.selection[0];
    const element = elements.find(el => el.id === selectedId);

    if (!element) return null;

    const handleChange = (key: string, value: any) => {
        updateElement(selectedId, { [key]: value });
    };

    const getVisualColor = (c: string) => {
        if (c === "transparent") return "transparent";
        if (isDarkMode && c === "#000000") return "#ffffff";
        if (!isDarkMode && c === "#ffffff") return "#000000";
        return c;
    };

    return (
        <div className="fixed top-20 left-4 bg-white dark:bg-zinc-800 p-5 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-700 w-72 z-10 transition-all duration-300">
            <h3 className="text-sm font-bold mb-4 text-zinc-800 dark:text-zinc-100 uppercase tracking-wider">Properties</h3>

            <div className="mb-4">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">Stroke Color</label>
                <div className="flex gap-2 flex-wrap">
                    {colors.map(c => {
                        const visualColor = getVisualColor(c);
                        return (
                            <button
                                key={c}
                                className={cn(
                                    "w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-700 flex items-center justify-center transition-transform hover:scale-110 shadow-sm",
                                    element.strokeColor === c && "ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-zinc-900"
                                )}
                                style={{ backgroundColor: visualColor === "transparent" ? "transparent" : visualColor }}
                                onClick={() => handleChange("strokeColor", c)}
                                title={c}
                            >
                                {visualColor === "transparent" && <div className="text-red-500 text-xs font-bold">/</div>}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="mb-4">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">Background</label>
                <div className="flex gap-2 flex-wrap">
                    {colors.map(c => {
                        const visualColor = getVisualColor(c);
                        return (
                            <button
                                key={c}
                                className={cn(
                                    "w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-700 relative flex items-center justify-center transition-transform hover:scale-110 shadow-sm",
                                    element.backgroundColor === c && "ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-zinc-900"
                                )}
                                style={{ backgroundColor: visualColor === "transparent" ? "transparent" : visualColor }}
                                onClick={() => handleChange("backgroundColor", c)}
                                title={c}
                            >
                                {visualColor === "transparent" && <div className="text-red-500 text-xs font-bold">/</div>}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Stroke Width</label>
                        <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">{element.strokeWidth}</span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="10"
                        value={element.strokeWidth}
                        onChange={(e) => handleChange("strokeWidth", parseInt(e.target.value))}
                        className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                </div>

                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Roughness</label>
                        <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">{element.roughness}</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.5"
                        value={element.roughness}
                        onChange={(e) => handleChange("roughness", parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                </div>

                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Opacity</label>
                        <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">{element.opacity}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={element.opacity}
                        onChange={(e) => handleChange("opacity", parseInt(e.target.value))}
                        className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                </div>
            </div>
        </div>
    );
}
