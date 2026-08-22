"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import type { RosterEntry } from "@/lib/collab/presence";

/**
 * The two moments a session asks you something, both as one centred dialog:
 * starting a room, and arriving in someone else's for the first time.
 *
 * These are modal on purpose, which is a reversal. Joining used to open the
 * session panel on a pre-filled generated name, on the reasoning that nothing
 * should stand between you and the canvas. In practice nobody typed over it, so
 * rooms filled up with Warm Ibises and Quiet Martens and the avatars stopped
 * meaning anything — the point of a name in a shared room is that the other
 * people can tell who you are. Asking once, up front, is the smaller cost.
 *
 * It is asked exactly once ever: the answer is remembered, so a returning
 * visitor goes straight in and never sees either of these again.
 */

/** Escape and a backdrop click both mean "not now", where that is allowed. */
function DialogShell({
    titleId, onDismiss, children,
}: {
    titleId: string;
    onDismiss?: () => void;
    children: ReactNode;
}) {
    const card = useRef<HTMLDivElement>(null);

    // Keep the tab key inside the dialog. Without it, tabbing walks out into a
    // canvas that is not supposed to be reachable yet, and the focus ring
    // disappears somewhere behind the backdrop.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && onDismiss) { onDismiss(); return; }
            if (e.key !== "Tab" || !card.current) return;
            const focusable = card.current.querySelectorAll<HTMLElement>(
                'input, button, a[href], [tabindex]:not([tabindex="-1"])'
            );
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onDismiss]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onDismiss?.(); }}
        >
            <div
                ref={card}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#232329]"
            >
                {children}
            </div>
        </div>
    );
}

function Field({
    label, value, onChange, onEnter, placeholder, autoFocus, maxLength,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    onEnter: () => void;
    placeholder: string;
    autoFocus?: boolean;
    maxLength: number;
}) {
    return (
        <label className="mt-4 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {label}
            <input
                autoFocus={autoFocus}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                // Enter is handled here rather than left to the form's implicit
                // submission, which depends on the keypress default action and
                // so is skipped by anything that synthesises key events —
                // including the tooling this was verified with. Explicit is
                // also the only way Enter works from either field.
                onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    onEnter();
                }}
                placeholder={placeholder}
                maxLength={maxLength}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-500 dark:border-zinc-700 dark:bg-[#1e1e24] dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />
        </label>
    );
}

const primaryButton =
    "mt-5 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600";

const quietLink =
    "mt-3 block text-center text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200";

/**
 * Starting a room: name it, and say who you are.
 *
 * The room name is optional — an unnamed room works, and the placeholder says
 * what you get if you skip it. Your own name is not, because it is the thing
 * everyone else in the room will see.
 */
export function StartSessionDialog({
    initialName, onCancel, onStart,
}: {
    initialName: string;
    onCancel: () => void;
    onStart: (roomName: string, yourName: string) => void;
}) {
    const titleId = useId();
    const [roomName, setRoomName] = useState("");
    const [yourName, setYourName] = useState(initialName);
    const ready = yourName.trim().length > 0;

    const submit = () => { if (ready) onStart(roomName.trim(), yourName.trim()); };

    return (
        <DialogShell titleId={titleId} onDismiss={onCancel}>
            <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                    <Users size={20} />
                </div>
                <h2 id={titleId} className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    Start a session
                </h2>
                <p className="mt-1 text-sm leading-snug text-zinc-500 dark:text-zinc-400">
                    Everything on your canvas comes with you. Share the link and
                    you will see each other draw, live.
                </p>

                <Field
                    label="Room name"
                    value={roomName}
                    onChange={setRoomName}
                    onEnter={submit}
                    placeholder="Untitled room"
                    maxLength={60}
                />
                <Field
                    label="Your name"
                    value={yourName}
                    onChange={setYourName}
                    onEnter={submit}
                    placeholder="So people know who is drawing"
                    autoFocus
                    maxLength={32}
                />

                <button type="submit" disabled={!ready} className={primaryButton}>
                    Start session
                </button>
                <button type="button" onClick={onCancel} className={quietLink}>
                    Never mind
                </button>
            </form>
        </DialogShell>
    );
}

/** "Alex, Sam and 2 others", or nothing when the room is empty. */
const listNames = (roster: RosterEntry[]): string => {
    const names = roster.map((p) => p.name);
    if (names.length <= 2) return names.join(" and ");
    return `${names.slice(0, 2).join(", ")} and ${names.length - 2} ${
        names.length - 2 === 1 ? "other" : "others"
    }`;
};

/**
 * Arriving in someone else's room for the first time.
 *
 * There is no way past this but to answer it or leave, which is the point —
 * presence is held until it is answered, so the room does not see you at all
 * until you have a name. The room's own name and who is already in it come
 * from the document and the awareness channel, both of which are readable
 * while held.
 */
export function JoinSessionDialog({
    roomName, roster, initialName, onJoin,
}: {
    roomName: string;
    roster: RosterEntry[];
    initialName: string;
    onJoin: (yourName: string) => void;
}) {
    const titleId = useId();
    const [yourName, setYourName] = useState(initialName);
    const ready = yourName.trim().length > 0;

    const submit = () => { if (ready) onJoin(yourName.trim()); };

    return (
        <DialogShell titleId={titleId}>
            <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                    <Users size={20} />
                </div>
                <h2 id={titleId} className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {/* The name arrives with the first sync, so this reads
                        generically for the moment before it does. */}
                    {roomName ? `Join “${roomName}”` : "Join session"}
                </h2>
                <p className="mt-1 text-sm leading-snug text-zinc-500 dark:text-zinc-400">
                    {roster.length > 0
                        ? `${listNames(roster)} ${roster.length === 1 ? "is" : "are"} already here.`
                        : "Nobody else is here yet."}
                </p>

                <Field
                    label="Your name"
                    value={yourName}
                    onChange={setYourName}
                    onEnter={submit}
                    placeholder="So people know who is drawing"
                    autoFocus
                    maxLength={32}
                />

                <button type="submit" disabled={!ready} className={primaryButton}>
                    Join
                </button>
                {/* The way out, for someone who opened a link they did not mean
                    to. A link rather than a close button: leaving a room means
                    going somewhere, and unmounting is what tears the session
                    down — see the teardown note in useCollab. */}
                <Link href="/" className={quietLink}>
                    Go to my own canvas instead
                </Link>
            </form>
        </DialogShell>
    );
}
