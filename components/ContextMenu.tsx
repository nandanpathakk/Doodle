"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { hasClipboard } from "@/lib/clipboard";
import {
    copySelection,
    cutSelection,
    pasteClipboard,
    duplicateSelection,
    deleteSelection,
    selectAll,
} from "@/lib/actions";
import { copyPngToClipboard } from "@/lib/export";

export interface ContextMenuState {
    x: number;
    y: number;
}

function MenuItem({ label, shortcut, onClick, disabled, danger }: {
    label: string; shortcut?: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={[
                "w-full flex items-center justify-between gap-6 px-3 py-1.5 text-sm rounded-md text-left transition-colors",
                disabled ? "opacity-40 cursor-default" : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                danger ? "text-red-500" : "text-zinc-700 dark:text-zinc-200",
            ].join(" ")}
        >
            <span>{label}</span>
            {shortcut && <span className="text-xs text-zinc-400">{shortcut}</span>}
        </button>
    );
}

const MenuDivider = () => <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />;

export default function ContextMenu({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    const selection = useStore((s) => s.appState.selection);
    const moveSelection = useStore((s) => s.moveSelection);
    const isDarkMode = useStore((s) => s.isDarkMode);

    const hasSelection = selection.length > 0;

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    const run = (fn: () => void) => () => {
        fn();
        onClose();
    };

    // Keep the menu on-screen.
    const left = Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 200);
    const top = Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 360);

    return (
        <div
            ref={ref}
            className="fixed z-50 w-52 p-1 rounded-xl bg-white dark:bg-[#232329] shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in-95 duration-100"
            style={{ left, top }}
        >
            {hasSelection ? (
                <>
                    <MenuItem label="Copy" shortcut="⌘C" onClick={run(copySelection)} />
                    <MenuItem label="Cut" shortcut="⌘X" onClick={run(cutSelection)} />
                    <MenuItem label="Duplicate" shortcut="⌘D" onClick={run(duplicateSelection)} />
                    <MenuItem label="Copy as PNG" onClick={run(() => { void copyPngToClipboard(useStore.getState().elements.filter((el) => selection.includes(el.id)), isDarkMode); })} />
                    <MenuDivider />
                    <MenuItem label="Bring to front" shortcut="⌘⇧]" onClick={run(() => moveSelection("front"))} />
                    <MenuItem label="Bring forward" shortcut="⌘]" onClick={run(() => moveSelection("forward"))} />
                    <MenuItem label="Send backward" shortcut="⌘[" onClick={run(() => moveSelection("backward"))} />
                    <MenuItem label="Send to back" shortcut="⌘⇧[" onClick={run(() => moveSelection("back"))} />
                    <MenuDivider />
                    <MenuItem label="Delete" shortcut="⌫" danger onClick={run(deleteSelection)} />
                </>
            ) : (
                <>
                    <MenuItem label="Paste" shortcut="⌘V" disabled={!hasClipboard()} onClick={run(pasteClipboard)} />
                    <MenuItem label="Select all" shortcut="⌘A" onClick={run(selectAll)} />
                </>
            )}
        </div>
    );
}
