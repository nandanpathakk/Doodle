import { nanoid } from "nanoid";
import type { Element } from "../types.ts";

/**
 * Starting and joining sessions.
 *
 * The solo canvas and each room are separate documents that are never merged.
 * Starting a session copies the current drawing into a fresh room; *joining*
 * someone else's link must not push your canvas into theirs, and must leave
 * your own canvas untouched so you can go back to it.
 *
 * The copy is handed over through sessionStorage rather than being merged by
 * the room itself, so the intent — "I started this room from my canvas" — is
 * explicit, and is absent when following someone else's link.
 */

const SEED_PREFIX = "doodle-room-seed:";

export const createRoomId = (): string => nanoid(12);

/** IndexedDB document name. Rooms and the solo canvas never share one. */
export const docNameFor = (roomId: string | null): string =>
    roomId ? `doodle-room-${roomId}` : "doodle-local";

export const roomUrl = (roomId: string): string =>
    typeof window === "undefined" ? `/r/${roomId}` : `${window.location.origin}/r/${roomId}`;

/** Hand the current drawing to a room we are about to open. */
export const stashRoomSeed = (roomId: string, elements: Element[]): void => {
    try {
        sessionStorage.setItem(SEED_PREFIX + roomId, JSON.stringify(elements));
    } catch {
        // Not worth failing to start a session over; the room just starts empty.
    }
};

/**
 * Peek at the drawing stashed for this room, if we are the one who started it.
 *
 * Deliberately not consumed on read: React invokes effects twice in
 * development, and a destructive read means the discarded first run eats the
 * seed and the real one starts empty. Clear it with clearRoomSeed once it has
 * actually been used.
 */
export const readRoomSeed = (roomId: string): Element[] => {
    try {
        const raw = sessionStorage.getItem(SEED_PREFIX + roomId);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as Element[]) : [];
    } catch {
        return [];
    }
};

/** Drop the stash, so reloading the room later does not re-seed it. */
export const clearRoomSeed = (roomId: string): void => {
    try {
        sessionStorage.removeItem(SEED_PREFIX + roomId);
    } catch {
        // Nothing useful to do; a stale key is harmless once the room has content.
    }
};

/** Relay endpoint. Override with NEXT_PUBLIC_COLLAB_URL when deploying. */
export const relayUrl = (): string =>
    process.env.NEXT_PUBLIC_COLLAB_URL ?? "ws://localhost:1234";
