"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Copy, Check, LogOut } from "lucide-react";
import { useStore } from "@/store/useStore";
import { roomUrl } from "@/lib/collab/session";

/**
 * Shows that a session is live, and how it is doing.
 *
 * The connection state is reported plainly rather than optimistically: edits
 * made while reconnecting are kept locally and merge on reconnect, but the user
 * should be able to see that peers are not receiving them yet.
 */
export default function SessionIndicator() {
    const roomId = useStore((s) => s.roomId);
    const connection = useStore((s) => s.connection);
    const [copied, setCopied] = useState(false);

    if (!roomId) return null;

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(roomUrl(roomId));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    const connected = connection === "connected";

    return (
        <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm dark:border-zinc-800 dark:bg-[#232329]">
            <span className="relative flex h-2.5 w-2.5" title={connected ? "Connected" : "Reconnecting…"}>
                {connected && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                )}
                <span
                    className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
                />
            </span>

            <Users size={16} className="text-zinc-500 dark:text-zinc-400" />
            <span className="text-sm text-zinc-700 dark:text-zinc-200">
                {connected ? "Live session" : "Reconnecting…"}
            </span>

            <button
                onClick={copyLink}
                title="Copy invite link"
                aria-label="Copy invite link"
                className="ml-1 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
            </button>

            {/* Client-side navigation, so leaving unmounts the app and tears the
                room document down properly rather than reloading the page. */}
            <Link
                href="/"
                title="Leave session"
                aria-label="Leave session"
                className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
                <LogOut size={16} />
            </Link>
        </div>
    );
}
