"use client";

import { useState, useEffect, useTransition } from "react";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { Paintbrush, MousePointer2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import type { Element, ToolType } from "@/lib/types";
import { measureTextBlock } from "@/lib/text";

const colors = [
    "#000000", "#343a40", "#495057", "#c92a2a", "#a61e4d",
    "#862e9c", "#5f3dc4", "#364fc7", "#1864ab", "#0b7285",
    "#087f5b", "#2b8a3e", "#5c940d", "#e67700", "#d9480f", "transparent"
];

const DRAW_TOOLS: ToolType[] = ["rectangle", "circle", "diamond", "line", "arrow", "pencil", "text"];

const getVisualColor = (c: string, isDarkMode: boolean) => {
    if (c === "transparent") return "transparent";
    if (isDarkMode && c === "#000000") return "#ffffff";
    if (!isDarkMode && c === "#ffffff") return "#000000";
    return c;
};

function Segmented({
    value,
    options,
    onChange,
    onBegin,
}: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
    onBegin: () => void;
}) {
    return (
        <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-zinc-800 p-1">
            {options.map((o) => (
                <button
                    key={o.value}
                    onClick={() => { onBegin(); onChange(o.value); }}
                    className={cn(
                        "flex-1 text-xs py-1 rounded-md transition-colors",
                        value === o.value
                            ? "bg-white dark:bg-zinc-700 shadow-sm text-indigo-600 dark:text-indigo-300 font-medium"
                            : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

// Module-level so React keeps a stable component identity across renders.
// (Previously defined inline, which remounted the slider on every keystroke and
// dropped focus / reset the drag.)
function SmoothSlider({
    value,
    onValueChange,
    onBegin,
    min,
    max,
    step,
}: {
    value: number;
    onValueChange: (val: number) => void;
    onBegin: () => void;
    min: number;
    max: number;
    step: number;
}) {
    const [localValue, setLocalValue] = useState(value);

    // Sync when the external value changes (e.g. undo/redo or selecting a new element)
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleChange = (vals: number[]) => {
        const newValue = vals[0];
        setLocalValue(newValue); // instant UI feedback
        onValueChange(newValue);
    };

    return (
        <Slider
            value={[localValue]}
            min={min}
            max={max}
            step={step}
            onPointerDown={onBegin}
            onValueChange={handleChange}
            className="w-full"
        />
    );
}

function StrokeSection({
    element,
    isDarkMode,
    onChange,
    onBegin,
}: {
    element: Element;
    isDarkMode: boolean;
    onChange: (key: string, value: unknown) => void;
    onBegin: () => void;
}) {
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Stroke Color</label>
                <div className="grid grid-cols-5 gap-2">
                    {colors.slice(0, 10).map((c) => (
                        <button
                            key={c}
                            className={cn(
                                "w-8 h-8 rounded-md transition-transform hover:scale-105 active:scale-95 border border-transparent shadow-sm",
                                element.strokeColor === c && "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-[#232329]",
                                c === "transparent" && "bg-checkered border-gray-200"
                            )}
                            style={{ backgroundColor: getVisualColor(c, isDarkMode) === "transparent" ? "transparent" : getVisualColor(c, isDarkMode) }}
                            onClick={() => { onBegin(); onChange("strokeColor", c); }}
                        />
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex justify-between text-xs text-gray-400">
                    <span>Width</span>
                    <span>{element.strokeWidth}</span>
                </div>
                <SmoothSlider
                    value={element.strokeWidth}
                    min={1}
                    max={20}
                    step={1}
                    onBegin={onBegin}
                    onValueChange={(val) => onChange("strokeWidth", val)}
                />
            </div>

            <div className="space-y-3">
                <div className="flex justify-between text-xs text-gray-400">
                    <span>Sloppiness</span>
                    <span>{element.roughness}</span>
                </div>
                <SmoothSlider
                    value={element.roughness}
                    min={0}
                    max={5}
                    step={0.5}
                    onBegin={onBegin}
                    onValueChange={(val) => onChange("roughness", val)}
                />
            </div>

            <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Stroke Style</label>
                <Segmented
                    value={element.strokeStyle ?? "solid"}
                    onChange={(v) => onChange("strokeStyle", v)}
                    onBegin={onBegin}
                    options={[{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }]}
                />
            </div>

            {element.type === "rectangle" && (
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Edges</label>
                    <Segmented
                        value={element.edges ?? "sharp"}
                        onChange={(v) => onChange("edges", v)}
                        onBegin={onBegin}
                        options={[{ value: "sharp", label: "Sharp" }, { value: "round", label: "Round" }]}
                    />
                </div>
            )}

            {element.type === "text" && (
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Font Size</label>
                    <Segmented
                        value={String(element.fontSize ?? 20)}
                        onChange={(v) => onChange("fontSize", Number(v))}
                        onBegin={onBegin}
                        options={[{ value: "16", label: "S" }, { value: "20", label: "M" }, { value: "28", label: "L" }, { value: "36", label: "XL" }]}
                    />
                </div>
            )}
        </div>
    );
}

function BackgroundSection({
    element,
    isDarkMode,
    onChange,
    onBegin,
}: {
    element: Element;
    isDarkMode: boolean;
    onChange: (key: string, value: unknown) => void;
    onBegin: () => void;
}) {
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Background</label>
                <div className="grid grid-cols-5 gap-2">
                    {colors.slice(0, 10).concat(["transparent"]).map((c) => (
                        <button
                            key={`bg-${c}`}
                            className={cn(
                                "w-8 h-8 rounded-md transition-transform hover:scale-105 active:scale-95 border border-transparent shadow-sm relative overflow-hidden",
                                element.backgroundColor === c && "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-[#232329]",
                                c === "transparent" && "border-gray-200"
                            )}
                            style={{ backgroundColor: getVisualColor(c, isDarkMode) === "transparent" ? "transparent" : getVisualColor(c, isDarkMode) }}
                            onClick={() => { onBegin(); onChange("backgroundColor", c); }}
                        >
                            {c === "transparent" && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-[1px] h-[150%] bg-red-500 rotate-45" />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {element.backgroundColor !== "transparent" && (
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Fill Style</label>
                    <Segmented
                        value={element.fillStyle ?? "hachure"}
                        onChange={(v) => onChange("fillStyle", v)}
                        onBegin={onBegin}
                        options={[{ value: "hachure", label: "Hachure" }, { value: "solid", label: "Solid" }, { value: "cross-hatch", label: "Cross" }]}
                    />
                </div>
            )}

            <div className="space-y-3">
                <div className="flex justify-between text-xs text-gray-400">
                    <span>Opacity</span>
                    <span>{element.opacity}%</span>
                </div>
                <SmoothSlider
                    value={element.opacity}
                    min={0}
                    max={100}
                    step={1}
                    onBegin={onBegin}
                    onValueChange={(val) => onChange("opacity", val)}
                />
            </div>
        </div>
    );
}

export default function PropertiesPanel() {
    const { elements, appState, updateElement, isDarkMode, currentStyle, setCurrentStyle, beginGesture } = useStore();

    const [activeMobilePanel, setActiveMobilePanel] = useState<"stroke" | "background" | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [isOpen, setIsOpen] = useState(true);
    const [, startTransition] = useTransition();

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
            if (window.innerWidth < 768) setIsOpen(false);
            else setIsOpen(true);
        };
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const hasSelection = appState.selection.length > 0;

    // Deselecting closes any open mobile sub-panel. Adjusting state during
    // render (React's documented pattern) instead of in an effect, so the panel
    // never paints once in the stale state before closing.
    const [prevHasSelection, setPrevHasSelection] = useState(hasSelection);
    if (prevHasSelection !== hasSelection) {
        setPrevHasSelection(hasSelection);
        if (!hasSelection) setActiveMobilePanel(null);
    }
    const editingDefaults = !hasSelection;

    // Show the panel when something is selected OR a drawing tool is active (to set defaults).
    if (editingDefaults && !DRAW_TOOLS.includes(appState.tool)) return null;

    // The element whose values we display: the first selected one, or a synthetic
    // element backed by the current default style.
    const element: Element | undefined = hasSelection
        ? elements.find((el) => el.id === appState.selection[0])
        : ({ ...currentStyle, id: "", type: appState.tool, x: 0, y: 0, width: 0, height: 0, seed: 0, version: 0 } as Element);

    if (!element) return null;

    // Open a gesture at the start of an edit, so a slider sweep is one undo step.
    // It is closed centrally on pointer release (see useCanvasLogic).
    const handleBegin = () => {
        if (hasSelection) beginGesture();
    };

    const handleChange = (key: string, value: unknown) => {
        if (hasSelection) {
            startTransition(() => {
                appState.selection.forEach((id) => {
                    // Font size changes the rendered text box — re-measure it.
                    const el = key === "fontSize" ? elements.find((e) => e.id === id) : undefined;
                    if (el?.type === "text") {
                        const { width, height } = measureTextBlock(el.text ?? "", value as number);
                        updateElement(id, { fontSize: value as number, width, height });
                    } else {
                        updateElement(id, { [key]: value });
                    }
                });
            });
        }
        // Remember the last-used value so the next new shape inherits it.
        setCurrentStyle({ [key]: value });
    };

    if (isMobile) {
        return (
            <>
                <div className="fixed bottom-24 left-6 z-40 flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-300">
                    <button
                        onClick={() => setActiveMobilePanel(activeMobilePanel === "background" ? null : "background")}
                        className={cn(
                            "w-10 h-10 rounded-full bg-white dark:bg-[#232329] shadow-lg flex items-center justify-center transition-all active:scale-95",
                            activeMobilePanel === "background" ? "ring-2 ring-indigo-500" : ""
                        )}
                    >
                        <div
                            className="w-5 h-5 rounded-md border border-gray-200 dark:border-gray-600 relative overflow-hidden"
                            style={{ backgroundColor: getVisualColor(element.backgroundColor, isDarkMode) }}
                        >
                            {element.backgroundColor === "transparent" && <div className="absolute inset-0 flex items-center justify-center"><div className="w-[1px] h-[150%] bg-red-500 rotate-45" /></div>}
                        </div>
                    </button>

                    <button
                        onClick={() => setActiveMobilePanel(activeMobilePanel === "stroke" ? null : "stroke")}
                        className={cn(
                            "w-10 h-10 rounded-full bg-white dark:bg-[#232329] shadow-lg flex items-center justify-center transition-all active:scale-95 relative",
                            activeMobilePanel === "stroke" ? "ring-2 ring-indigo-500" : ""
                        )}
                    >
                        <Paintbrush className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
                        <div
                            className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#232329]"
                            style={{ backgroundColor: getVisualColor(element.strokeColor, isDarkMode) }}
                        />
                    </button>
                </div>

                {activeMobilePanel && (
                    <div className="fixed bottom-36 left-6 z-50 w-72 bg-white dark:bg-[#232329] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 p-4 animate-in zoom-in-95 duration-200 max-h-[50vh] overflow-y-auto scrollbar-thin">
                        {activeMobilePanel === "stroke" && <StrokeSection element={element} isDarkMode={isDarkMode} onChange={handleChange} onBegin={handleBegin} />}
                        {activeMobilePanel === "background" && <BackgroundSection element={element} isDarkMode={isDarkMode} onChange={handleChange} onBegin={handleBegin} />}
                    </div>
                )}
            </>
        );
    }

    if (!isOpen) return null;

    return (
        <div className="fixed top-20 left-4 flex flex-col gap-4 p-4 rounded-xl shadow-2xl bg-white dark:bg-[#232329] border border-gray-200 dark:border-gray-800 w-64 z-20 transition-all duration-300 animate-in slide-in-from-left-4 fade-in max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-thin">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                <MousePointer2 className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {hasSelection ? "Properties" : "Defaults"}
                </span>
            </div>

            <StrokeSection element={element} isDarkMode={isDarkMode} onChange={handleChange} onBegin={handleBegin} />
            <div className="w-full h-px bg-gray-100 dark:bg-gray-800" />
            <BackgroundSection element={element} isDarkMode={isDarkMode} onChange={handleChange} onBegin={handleBegin} />
        </div>
    );
}
