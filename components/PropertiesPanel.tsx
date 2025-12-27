"use client";

import { useState, useEffect, useTransition } from "react";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { Paintbrush, Square, Activity, MousePointer2, Minus } from "lucide-react";
import { Slider } from "@/components/ui/slider";

const colors = [
    "#000000", "#343a40", "#495057", "#c92a2a", "#a61e4d",
    "#862e9c", "#5f3dc4", "#364fc7", "#1864ab", "#0b7285",
    "#087f5b", "#2b8a3e", "#5c940d", "#e67700", "#d9480f", "transparent"
];

export default function PropertiesPanel() {
    const { elements, appState, updateElement, isDarkMode } = useStore();

    // State for mobile popovers
    const [activeMobilePanel, setActiveMobilePanel] = useState<'stroke' | 'background' | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [isOpen, setIsOpen] = useState(true);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
            if (window.innerWidth < 768) setIsOpen(false);
            else setIsOpen(true);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Reset mobile panel state when selection is cleared
    useEffect(() => {
        if (appState.selection.length === 0) {
            setActiveMobilePanel(null);
        }
    }, [appState.selection]);

    // Desktop: render full panel if selected
    // Mobile: always render triggers (if selected), render panel activeMobilePanel is set

    // Logic split
    if (appState.selection.length === 0) return null;

    const selectedId = appState.selection[0];
    const element = elements.find(el => el.id === selectedId);

    if (!element) return null;

    const handleChange = (key: string, value: any) => {
        startTransition(() => {
            updateElement(selectedId, { [key]: value });
        });
    };

    const getVisualColor = (c: string) => {
        if (c === "transparent") return "transparent";
        if (isDarkMode && c === "#000000") return "#ffffff";
        if (!isDarkMode && c === "#ffffff") return "#000000";
        return c;
    };

    // --- Helper Component for Smooth Sliders ---
    const SmoothSlider = ({
        value,
        onValueChange,
        min,
        max,
        step
    }: {
        value: number,
        onValueChange: (val: number) => void,
        min: number,
        max: number,
        step: number
    }) => {
        const [localValue, setLocalValue] = useState(value);

        // Sync local value when external value changes (e.g. undo/redo)
        // We only sync if the user is NOT currently dragging? 
        // Radix slider handles interactions well, but if we receive a new prop during drag it might jitter.
        // However, standard useEffect sync is usually correct for "External Control".
        useEffect(() => {
            setLocalValue(value);
        }, [value]);

        const handleChange = (vals: number[]) => {
            const newValue = vals[0];
            setLocalValue(newValue); // Instant UI update

            startTransition(() => {
                onValueChange(newValue); // Deferred App update
            });
        };

        return (
            <Slider
                value={[localValue]}
                min={min}
                max={max}
                step={step}
                onValueChange={handleChange}
                className="w-full"
            />
        );
    };

    // --- Content Components ---
    const StrokeSection = () => (
        <div className="space-y-4">
            {/* Color Grid */}
            <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Stroke Color</label>
                <div className="grid grid-cols-5 gap-2">
                    {colors.slice(0, 10).map(c => (
                        <button
                            key={c}
                            className={cn(
                                "w-8 h-8 rounded-md transition-transform hover:scale-105 active:scale-95 border border-transparent shadow-sm",
                                element.strokeColor === c && "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-[#232329]",
                                c === "transparent" && "bg-checkered border-gray-200"
                            )}
                            style={{ backgroundColor: getVisualColor(c) === "transparent" ? "transparent" : getVisualColor(c) }}
                            onClick={() => handleChange("strokeColor", c)}
                        />
                    ))}
                </div>
            </div>

            {/* Width Slider */}
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
                    onValueChange={(val) => handleChange("strokeWidth", val)}
                />
            </div>

            {/* Roughness */}
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
                    onValueChange={(val) => handleChange("roughness", val)}
                />
            </div>
        </div>
    );

    const BackgroundSection = () => (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Background</label>
                <div className="grid grid-cols-5 gap-2">
                    {colors.slice(0, 10).concat(["transparent"]).map(c => (
                        <button
                            key={`bg-${c}`}
                            className={cn(
                                "w-8 h-8 rounded-md transition-transform hover:scale-105 active:scale-95 border border-transparent shadow-sm relative overflow-hidden",
                                element.backgroundColor === c && "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-[#232329]",
                                c === "transparent" && "border-gray-200"
                            )}
                            style={{ backgroundColor: getVisualColor(c) === "transparent" ? "transparent" : getVisualColor(c) }}
                            onClick={() => handleChange("backgroundColor", c)}
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
                    onValueChange={(val) => handleChange("opacity", val)}
                />
            </div>
        </div>
    );

    // --- Mobile Rendering ---
    if (isMobile) {
        return (
            <>
                <>
                    {/* Triggers (Bottom Left - Horizontal) */}
                    <div className="fixed bottom-24 left-6 z-40 flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-300">
                        <button
                            onClick={() => setActiveMobilePanel(activeMobilePanel === 'background' ? null : 'background')}
                            className={cn(
                                "w-10 h-10 rounded-full bg-white dark:bg-[#232329] shadow-lg flex items-center justify-center transition-all active:scale-95",
                                activeMobilePanel === 'background' ? "ring-2 ring-indigo-500" : ""
                            )}
                        >
                            <div
                                className="w-5 h-5 rounded-md border border-gray-200 dark:border-gray-600 relative overflow-hidden"
                                style={{ backgroundColor: getVisualColor(element.backgroundColor) }}
                            >
                                {element.backgroundColor === 'transparent' && <div className="absolute inset-0 flex items-center justify-center"><div className="w-[1px] h-[150%] bg-red-500 rotate-45" /></div>}
                            </div>
                        </button>

                        <button
                            onClick={() => setActiveMobilePanel(activeMobilePanel === 'stroke' ? null : 'stroke')}
                            className={cn(
                                "w-10 h-10 rounded-full bg-white dark:bg-[#232329] shadow-lg flex items-center justify-center transition-all active:scale-95",
                                activeMobilePanel === 'stroke' ? "ring-2 ring-indigo-500" : ""
                            )}
                        >
                            <Paintbrush className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
                            <div
                                className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#232329]"
                                style={{ backgroundColor: getVisualColor(element.strokeColor) }}
                            />
                        </button>
                    </div>

                    {/* Popover Panel */}
                    {activeMobilePanel && (
                        <div className="fixed bottom-36 left-6 z-50 w-72 bg-white dark:bg-[#232329] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 p-4 animate-in zoom-in-95 duration-200 max-h-[50vh] overflow-y-auto scrollbar-thin">
                            {activeMobilePanel === 'stroke' && <StrokeSection />}
                            {activeMobilePanel === 'background' && <BackgroundSection />}
                        </div>
                    )}
                </>
            </>
        );
    }

    // --- Desktop Rendering ---
    if (!isOpen) return null; // Logic handled in effect, but if we want manual toggle on desktop too...

    return (
        <div className="fixed top-20 left-4 flex flex-col gap-4 p-4 rounded-xl shadow-2xl bg-white dark:bg-[#232329] border border-gray-200 dark:border-gray-800 w-64 z-20 transition-all duration-300 animate-in slide-in-from-left-4 fade-in max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-thin">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                <MousePointer2 className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Properties</span>
            </div>

            <StrokeSection />
            <div className="w-full h-px bg-gray-100 dark:bg-gray-800" />
            <BackgroundSection />

        </div>
    );
}
