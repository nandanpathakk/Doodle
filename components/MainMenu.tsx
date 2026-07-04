"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, Image as ImageIcon, Copy, Save, FolderOpen } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Button } from "@/components/ui/button";
import { exportToPng, copyPngToClipboard, saveToFile, loadFromFile } from "@/lib/export";

function MenuItem({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 px-3 py-1.5 text-sm rounded-md text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

export default function MainMenu() {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const elements = useStore((s) => s.elements);
    const isDarkMode = useStore((s) => s.isDarkMode);
    const setElements = useStore((s) => s.setElements);
    const setSelection = useStore((s) => s.setSelection);
    const addToHistory = useStore((s) => s.addToHistory);

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, []);

    const handleOpenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow re-opening the same file
        if (!file) return;
        try {
            const loaded = await loadFromFile(file);
            addToHistory();
            setSelection([]);
            setElements(loaded);
        } catch {
            alert("Could not open file — it doesn't look like a valid Doodle file.");
        }
    };

    return (
        <div ref={ref} className="relative">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen((o) => !o)}
                className="rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Menu"
                aria-label="Menu"
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <Menu size={20} />
            </Button>

            {open && (
                <div className="absolute top-11 left-0 w-52 p-1 rounded-xl bg-white dark:bg-[#232329] shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in-95 duration-100">
                    <MenuItem label="Export PNG" icon={<ImageIcon size={16} />} onClick={() => { exportToPng(elements, isDarkMode); setOpen(false); }} />
                    <MenuItem label="Copy as PNG" icon={<Copy size={16} />} onClick={() => { void copyPngToClipboard(elements, isDarkMode); setOpen(false); }} />
                    <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                    <MenuItem label="Save to file" icon={<Save size={16} />} onClick={() => { saveToFile(elements); setOpen(false); }} />
                    <MenuItem label="Open file" icon={<FolderOpen size={16} />} onClick={() => { fileRef.current?.click(); setOpen(false); }} />
                </div>
            )}

            <input
                ref={fileRef}
                type="file"
                accept=".doodle,.json,application/json"
                className="hidden"
                onChange={handleOpenFile}
            />
        </div>
    );
}
