import { useStore } from "@/store/useStore";

export default function ZoomIndicator() {
    const { appState } = useStore();

    return (
        <div className="fixed top-4 right-4 md:top-auto md:right-auto md:bottom-4 md:left-4 z-50 bg-white/90 dark:bg-[#1e1e1e]/90 backdrop-blur-sm shadow-sm md:shadow-md rounded-lg px-2 h-8 md:h-auto md:px-3 md:py-2 flex items-center justify-center text-xs md:text-sm font-medium text-zinc-500 dark:text-zinc-400 border-none md:border border-zinc-200 dark:border-gray-800 select-none pointer-events-none">
            {Math.round(appState.zoom * 100)}%
        </div>
    );
}
