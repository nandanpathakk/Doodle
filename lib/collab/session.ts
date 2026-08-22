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
const NAME_PREFIX = "doodle-room-name:";

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

/**
 * The name the creator typed for a room they are about to open.
 *
 * Handed over the same way as the drawing, and for the same reason: only the
 * person who started the room has an opinion about what it is called, and
 * following someone else's link must never rename their room. A joiner has no
 * stash, so there is nothing for them to apply.
 *
 * Read without being consumed, like the seed — see readRoomSeed.
 */
export const stashRoomName = (roomId: string, name: string): void => {
    try {
        sessionStorage.setItem(NAME_PREFIX + roomId, name);
    } catch {
        // The room just starts unnamed, which is a state it already handles.
    }
};

export const readStashedRoomName = (roomId: string): string => {
    try {
        return sessionStorage.getItem(NAME_PREFIX + roomId) ?? "";
    } catch {
        return "";
    }
};

export const clearStashedRoomName = (roomId: string): void => {
    try {
        sessionStorage.removeItem(NAME_PREFIX + roomId);
    } catch {
        // Harmless once the name is on the document.
    }
};

/** The relay a production build talks to unless it is told otherwise. */
const DEPLOYED_RELAY = "wss://doodle-relay.onrender.com";

/** What `npm run server` starts, for anyone working on this locally. */
const LOCAL_RELAY = "ws://localhost:1234";

/**
 * Which relay to connect to.
 *
 * The deployed address lives here, in code, rather than in a committed
 * `.env.production`. It is not a secret — anything prefixed `NEXT_PUBLIC_` is
 * inlined into the client bundle and shipped to every browser — but a committed
 * env file becomes the obvious place to put the next piece of configuration,
 * and one day that is a real secret. Keeping a non-secret default in source
 * avoids setting that precedent while still making the deploy reproducible from
 * a clone.
 *
 * `NEXT_PUBLIC_COLLAB_URL` still wins where it is set, which is how you point a
 * build at a staging or self-hosted relay. Note it is read at *build* time, so
 * changing it means rebuilding, not restarting.
 */
export const relayUrl = (): string =>
    process.env.NEXT_PUBLIC_COLLAB_URL
    ?? (process.env.NODE_ENV === "production" ? DEPLOYED_RELAY : LOCAL_RELAY);
