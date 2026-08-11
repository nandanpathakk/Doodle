"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, LogOut, Share2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { createRoomId, roomUrl, stashRoomSeed } from "@/lib/collab/session";
import {
    getLocalPresence, getRoster, getServerLocalPresence, hasChosenName,
    markNameChosen, publishName, subscribeToLocalPresence, subscribeToRoster,
    type RosterEntry,
} from "@/lib/collab/presence";

/**
 * Everything to do with a shared session, in one place: starting one, seeing
 * who is in it, being seen under a name you chose, sharing the link, and
 * leaving.
 *
 * It was previously three: "Start session" buried in the main menu, a status
 * pill pinned to the bottom-right corner, and a desktop-only avatar strip. That
 * split them across the screen, hid the one action people actually look for,
 * and put the pill on top of the toolbar at phone widths.
 *
 * Position is the one thing still breakpoint-dependent, because the toolbar
 * moves: it is along the top on desktop and along the bottom on mobile, so this
 * takes whichever end is free. Everything inside is the same at every width.
 */

/** First letters of up to two words — "Swift Otter" becomes "SO". */
const initials = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";

function Avatar({ entry, you, followed }: { entry: RosterEntry; you?: boolean; followed?: boolean }) {
    const label = you ? `${entry.name} (you)` : followed ? `${entry.name} — following` : entry.name;
    return (
        <div
            title={label}
            aria-label={label}
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-semibold text-white shadow-sm ${
                followed
                    ? "border-indigo-500 dark:border-indigo-400"
                    : "border-white dark:border-[#232329]"
            }`}
            style={{ backgroundColor: entry.color }}
        >
            {initials(entry.name)}
        </div>
    );
}

export default function SessionBar() {
    // Deliberately no subscription to `elements`: this sits on screen for the
    // whole session, and reading the drawing reactively would re-render it on
    // every pointer move of every drag. The one place it is needed reads it
    // imperatively instead.
    const roomId = useStore((s) => s.roomId);
    const connection = useStore((s) => s.connection);
    const following = useStore((s) => s.followingClientId);
    const setFollowing = useStore((s) => s.setFollowing);
    const router = useRouter();
    const ref = useRef<HTMLDivElement>(null);

    const roster = useSyncExternalStore(subscribeToRoster, getRoster, getRoster);
    const local = useSyncExternalStore(
        subscribeToLocalPresence, getLocalPresence, getServerLocalPresence
    );

    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [nameDraft, setNameDraft] = useState<string | null>(null);
    const [focusName, setFocusName] = useState(false);

    // Ask for a name the first time someone joins a room, by opening the panel
    // on the name field rather than blocking behind a modal — the generated
    // name works, so there is nothing here that has to be answered before you
    // can draw. Adjusting state during render rather than from an effect avoids
    // rendering the closed panel first and then immediately replacing it.
    const [promptedFor, setPromptedFor] = useState<string | null>(null);
    if (roomId && local && promptedFor !== roomId) {
        setPromptedFor(roomId);
        if (!hasChosenName()) {
            setOpen(true);
            setFocusName(true);
        }
    }

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        window.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    // Starting a session copies the current drawing into a new room. The copy is
    // handed over explicitly, so following someone else's link never pushes this
    // canvas into their room — and this canvas is still here on return.
    const startSession = () => {
        const id = createRoomId();
        stashRoomSeed(id, useStore.getState().elements);
        router.push(`/r/${id}`);
    };

    if (!roomId) {
        return (
            <button
                onClick={startSession}
                title="Start a shared session"
                className="fixed right-4 top-16 z-30 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 md:bottom-4 md:top-auto dark:border-zinc-800 dark:bg-[#232329] dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
                <Share2 size={16} className="text-zinc-500 dark:text-zinc-400" />
                Share
            </button>
        );
    }

    const connected = connection === "connected";
    const link = roomUrl(roomId);
    // Everyone in the room, you first, so the room is never shown as empty when
    // you are standing in it.
    const everyone: RosterEntry[] = local ? [local, ...roster] : roster;

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    const commitName = () => {
        const trimmed = (nameDraft ?? "").trim();
        // Keeping the generated name is a choice too, so record it either way or
        // the prompt reappears on every join.
        if (trimmed) publishName(trimmed);
        else markNameChosen();
        setNameDraft(null);
        setFocusName(false);
    };

    return (
        <div ref={ref} className="fixed right-4 top-16 z-30 md:bottom-4 md:top-auto">
            <button
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="dialog"
                aria-expanded={open}
                title={connected ? "Shared session" : "Reconnecting to the relay…"}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white py-2 pl-3 pr-2.5 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#232329] dark:hover:bg-zinc-800"
            >
                {/* The connection state is reported plainly rather than
                    optimistically: edits made while reconnecting are kept and
                    merge later, but peers are not seeing them yet. */}
                <span className="relative flex h-2.5 w-2.5">
                    {connected && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    )}
                    <span
                        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
                    />
                </span>

                {connected ? (
                    <div className="flex -space-x-1.5">
                        {everyone.slice(0, 4).map((entry) => (
                            <Avatar
                                key={entry.clientId}
                                entry={entry}
                                you={entry === local}
                                followed={entry.clientId === following}
                            />
                        ))}
                        {everyone.length > 4 && (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-zinc-500 text-[10px] font-semibold text-white shadow-sm dark:border-[#232329]">
                                +{everyone.length - 4}
                            </div>
                        )}
                    </div>
                ) : (
                    <span className="text-sm text-zinc-700 dark:text-zinc-200">Reconnecting…</span>
                )}

                <Share2 size={16} className="ml-0.5 text-zinc-500 dark:text-zinc-400" />
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="Shared session"
                    className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-2xl md:bottom-full md:top-auto md:mb-2 md:mt-0 dark:border-zinc-800 dark:bg-[#232329]"
                >
                    {roster.length > 0 && (
                        <>
                            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                In this room
                            </p>
                            <ul className="mb-3 mt-1 flex flex-col gap-0.5">
                                {roster.map((peer) => {
                                    const isFollowed = peer.clientId === following;
                                    return (
                                        <li key={peer.clientId}>
                                            {/* Following moves this canvas with theirs; panning
                                                or zooming yourself stops it, so there is nothing
                                                to remember to switch off. */}
                                            <button
                                                onClick={() => setFollowing(isFollowed ? null : peer.clientId)}
                                                aria-pressed={isFollowed}
                                                title={isFollowed ? `Stop following ${peer.name}` : `Follow ${peer.name}`}
                                                className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm transition-colors ${
                                                    isFollowed
                                                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                                                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                                }`}
                                            >
                                                <span
                                                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                                                    style={{ backgroundColor: peer.color }}
                                                >
                                                    {initials(peer.name)}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate">{peer.name}</span>
                                                <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">
                                                    {isFollowed ? "Following" : "Follow"}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}

                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Your name
                        <input
                            autoFocus={focusName}
                            // Only when we opened this ourselves to ask: the
                            // generated name is there to be typed over, but
                            // someone who clicked in to make a small edit should
                            // keep their caret where they put it.
                            onFocus={(e) => { if (focusName) e.currentTarget.select(); }}
                            value={nameDraft ?? local?.name ?? ""}
                            onChange={(e) => setNameDraft(e.target.value)}
                            onBlur={commitName}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") { e.currentTarget.blur(); }
                                if (e.key === "Escape") { setNameDraft(null); setFocusName(false); }
                            }}
                            maxLength={32}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-normal text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-[#1e1e24] dark:text-zinc-100"
                        />
                    </label>

                    <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Invite link
                    </p>
                    <div className="mt-1 flex gap-1.5">
                        <input
                            readOnly
                            value={link}
                            onFocus={(e) => e.currentTarget.select()}
                            aria-label="Invite link"
                            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600 outline-none dark:border-zinc-700 dark:bg-[#1e1e24] dark:text-zinc-300"
                        />
                        <button
                            onClick={copyLink}
                            aria-label="Copy invite link"
                            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">
                        Anyone with this link can view and edit. There is no password.
                    </p>

                    {/* Client-side navigation, so leaving unmounts the app and
                        tears the room document down properly rather than
                        reloading the page. */}
                    <Link
                        href="/"
                        className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-zinc-200 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        <LogOut size={15} />
                        Leave session
                    </Link>
                </div>
            )}
        </div>
    );
}
