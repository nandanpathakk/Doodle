import { Hand, Box, Type, MousePointer2 } from "lucide-react";

export default function WelcomeScreen() {
    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 transition-opacity duration-500">
            <div className="max-w-4xl w-full p-6 md:p-12 text-center select-none">
                {/* Hero Section */}
                <div className="space-y-1 mb-4 md:mb-16">
                    <h1 className="text-xl md:text-6xl font-bold font-hand text-black dark:text-white tracking-tight opacity-90">
                        Doodle
                    </h1>
                    <p className="text-xs md:text-xl text-gray-500 dark:text-gray-400 font-sans font-light tracking-wide">
                        Sketch. Plan. Iterate.
                    </p>
                </div>

                {/* Features Grid - Minimal, no backgrounds */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-12 px-4 max-w-5xl mx-auto">
                    {/* Feature 1 */}
                    <div className="group space-y-2 md:space-y-4">
                        <div className="flex justify-center">
                            <div className="p-2 md:p-3 rounded-2xl bg-gray-50 dark:bg-[#1e1e1e] border border-transparent dark:border-gray-800 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                                <Box className="w-5 h-5 md:w-6 md:h-6 text-gray-700 dark:text-gray-200 stroke-[1.5]" />
                            </div>
                        </div>
                        <div className="space-y-1 md:space-y-2">
                            <h3 className="font-hand text-lg md:text-xl font-bold text-gray-800 dark:text-gray-100">
                                Infinite Canvas
                            </h3>
                            <p className="text-xs md:text-sm font-sans text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs mx-auto">
                                Rapidly visualize ideas with key primitives. No bounds, just space to think.
                            </p>
                        </div>
                    </div>

                    {/* Feature 2 */}
                    <div className="group space-y-2 md:space-y-4">
                        <div className="flex justify-center">
                            <div className="p-2 md:p-3 rounded-2xl bg-gray-50 dark:bg-[#1e1e1e] border border-transparent dark:border-gray-800 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                                <Type className="w-5 h-5 md:w-6 md:h-6 text-gray-700 dark:text-gray-200 stroke-[1.5]" />
                            </div>
                        </div>
                        <div className="space-y-1 md:space-y-2">
                            <h3 className="font-hand text-lg md:text-xl font-bold text-gray-800 dark:text-gray-100">
                                Smart Context
                            </h3>
                            <p className="text-xs md:text-sm font-sans text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs mx-auto">
                                Click borders to label connections. Text naturally integrates with your flow.
                            </p>
                        </div>
                    </div>

                    {/* Feature 3 */}
                    <div className="group space-y-2 md:space-y-4">
                        <div className="flex justify-center">
                            <div className="p-2 md:p-3 rounded-2xl bg-gray-50 dark:bg-[#1e1e1e] border border-transparent dark:border-gray-800 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                                <MousePointer2 className="w-5 h-5 md:w-6 md:h-6 text-gray-700 dark:text-gray-200 stroke-[1.5]" />
                            </div>
                        </div>
                        <div className="space-y-1 md:space-y-2">
                            <h3 className="font-hand text-lg md:text-xl font-bold text-gray-800 dark:text-gray-100">
                                Frictionless
                            </h3>
                            <p className="text-xs md:text-sm font-sans text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs mx-auto">
                                Zero setup. Auto-saving. Your hand-drawn virtual whiteboard.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Subtle Footer Prompt */}
                <div className="mt-12 md:mt-20 opacity-0 animate-in fade-in duration-1000 delay-500 fill-mode-forwards">
                    <p className="text-xs font-sans text-gray-300 dark:text-gray-700 tracking-widest uppercase">
                        Start drawing to begin
                    </p>
                </div>
            </div>
        </div>
    );
}
