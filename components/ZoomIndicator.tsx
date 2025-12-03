import { useStore } from "@/store/useStore";

export default function ZoomIndicator() {
    const { appState } = useStore();

    return (
        <div className="fixed bottom-4 left-4 z-50 bg-white dark:bg-zinc-800 shadow-md rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 select-none pointer-events-none">
            {Math.round(appState.zoom * 100)}%
        </div>
    );
}
