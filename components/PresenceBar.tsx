"use client";

import { useState, useSyncExternalStore } from "react";
import { useStore } from "@/store/useStore";
import {
    subscribeToRoster, getRoster, getDisplayName, publishName,
} from "@/lib/collab/presence";

/** First letters of up to two words — "Swift Otter" becomes "SO". */
const initials = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";

export default function PresenceBar() {
    const roomId = useStore((s) => s.roomId);
    // Read once, lazily. The server has no localStorage, but this component
    // renders nothing outside a room and roomId is null during SSR, so there is
    // nothing to mismatch on hydration.
    const [name, setName] = useState(() =>
        typeof window === "undefined" ? "" : getDisplayName()
    );
    const [editing, setEditing] = useState(false);

    // Roster changes are rare — joins, leaves, renames — so unlike cursors it is
    // cheap to render from. Subscribing externally rather than mirroring it into
    // state avoids a setState-from-effect round trip on every change.
    const roster = useSyncExternalStore(subscribeToRoster, getRoster, getRoster);

    if (!roomId) return null;

    const commitName = () => {
        const trimmed = name.trim();
        if (trimmed) publishName(trimmed);
        else setName(getDisplayName());
        setEditing(false);
    };

    return (
        <div className="fixed top-4 right-28 z-20 hidden items-center gap-2 md:flex">
            {roster.length > 0 && (
                <div className="flex -space-x-2">
                    {roster.slice(0, 5).map((peer) => (
                        <div
                            key={peer.clientId}
                            title={peer.name}
                            aria-label={peer.name}
                            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[11px] font-semibold text-white shadow-sm dark:border-[#232329]"
                            style={{ backgroundColor: peer.color }}
                        >
                            {initials(peer.name)}
                        </div>
                    ))}
                    {roster.length > 5 && (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-zinc-500 text-[11px] font-semibold text-white shadow-sm dark:border-[#232329]">
                            +{roster.length - 5}
                        </div>
                    )}
                </div>
            )}

            {editing ? (
                <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commitName();
                        if (e.key === "Escape") { setName(getDisplayName()); setEditing(false); }
                    }}
                    maxLength={32}
                    aria-label="Your display name"
                    className="w-32 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm outline-none dark:border-zinc-700 dark:bg-[#232329] dark:text-zinc-100"
                />
            ) : (
                <button
                    onClick={() => setEditing(true)}
                    title="Change your name"
                    className="rounded-lg px-2 py-1 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                    {name || "You"}
                </button>
            )}
        </div>
    );
}
