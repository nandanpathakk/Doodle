"use client";

import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";

const colors = ["#000000", "#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "transparent"];

export default function PropertiesPanel() {
    const { elements, appState, updateElement } = useStore();

    if (appState.selection.length === 0) return null;

    const selectedId = appState.selection[0];
    const element = elements.find(el => el.id === selectedId);

    if (!element) return null;

    const handleChange = (key: string, value: any) => {
        updateElement(selectedId, { [key]: value });
    };

    return (
        <div className="fixed top-20 left-4 bg-white dark:bg-zinc-800 p-4 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 w-64 z-10">
            <h3 className="text-sm font-semibold mb-2">Properties</h3>

            <div className="mb-4">
                <label className="text-xs text-zinc-500 block mb-1">Stroke Color</label>
                <div className="flex gap-1 flex-wrap">
                    {colors.map(c => (
                        <button
                            key={c}
                            className={cn(
                                "w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-600 flex items-center justify-center",
                                element.strokeColor === c && "ring-2 ring-blue-500"
                            )}
                            style={{ backgroundColor: c === "transparent" ? "transparent" : c }}
                            onClick={() => handleChange("strokeColor", c)}
                            title={c}
                        >
                            {c === "transparent" && <div className="text-red-500 text-xs">/</div>}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-4">
                <label className="text-xs text-zinc-500 block mb-1">Background</label>
                <div className="flex gap-1 flex-wrap">
                    {colors.map(c => (
                        <button
                            key={c}
                            className={cn(
                                "w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-600 relative flex items-center justify-center",
                                element.backgroundColor === c && "ring-2 ring-blue-500"
                            )}
                            style={{ backgroundColor: c === "transparent" ? "transparent" : c }}
                            onClick={() => handleChange("backgroundColor", c)}
                            title={c}
                        >
                            {c === "transparent" && <div className="text-red-500 text-xs">/</div>}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-4">
                <label className="text-xs text-zinc-500 block mb-1">Stroke Width: {element.strokeWidth}</label>
                <input
                    type="range"
                    min="1"
                    max="10"
                    value={element.strokeWidth}
                    onChange={(e) => handleChange("strokeWidth", parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                />
            </div>

            <div className="mb-4">
                <label className="text-xs text-zinc-500 block mb-1">Roughness: {element.roughness}</label>
                <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.5"
                    value={element.roughness}
                    onChange={(e) => handleChange("roughness", parseFloat(e.target.value))}
                    className="w-full accent-blue-500"
                />
            </div>

            <div className="mb-4">
                <label className="text-xs text-zinc-500 block mb-1">Opacity: {element.opacity}%</label>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={element.opacity}
                    onChange={(e) => handleChange("opacity", parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                />
            </div>
        </div>
    );
}
