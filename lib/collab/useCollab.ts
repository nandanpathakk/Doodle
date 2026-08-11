"use client";

import { useEffect } from "react";
import type { Element } from "../types";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import { useStore } from "@/store/useStore";
import { bindStoreToDoc } from "./binding";
import { createUndoManager } from "./undo";
import { getElementsMap, gcDocTombstones, LOCAL_ORIGIN } from "./doc";
import { readLegacyElements, markLegacyImported } from "./legacy";
import { docNameFor, readRoomSeed, clearRoomSeed, relayUrl } from "./session";
import { startPresence } from "./presence";
import { startFollowSync } from "./follow";

/**
 * Identifies the session that currently owns the shared store state.
 *
 * Navigating between the canvas and a room unmounts one session and mounts the
 * next, and React does not guarantee the old cleanup runs before the new
 * effect. Without this, a late-arriving teardown would reset the session state
 * — or worse, clear the store — out from under the session that replaced it.
 */
let activeSession: object | null = null;

/**
 * How long to keep saying "Reconnecting…" before admitting the relay is not
 * answering. Long enough to ride out a dropped connection or a server restart,
 * short enough that someone who forgot to start the relay is not left guessing.
 */
const UNREACHABLE_AFTER_MS = 6000;

/**
 * Owns the document for this session: creates it, restores it from IndexedDB,
 * connects it to the relay when in a room, and binds it to the store.
 *
 * Rooms and the solo canvas are separate documents (see session.ts). Passing a
 * different roomId tears the whole thing down and starts again, which is what
 * keeps a room's contents from ever leaking into the local canvas.
 *
 * IndexedDB is asynchronous, unlike the localStorage it replaced, so the store
 * is empty for the first moments after mount. `isDocLoaded` lets the UI tell
 * "nothing drawn yet" apart from "not loaded yet".
 *
 * Every client keeps its own IndexedDB copy even in a room, so an offline edit
 * merges on reconnect rather than being lost, and a room that empties is
 * repopulated by whoever rejoins.
 */
export function useCollab(roomId: string | null = null): void {
    useEffect(() => {
        const session = {};
        activeSession = session;
        const isCurrent = () => activeSession === session;

        const store = useStore.getState();
        store.setSession(roomId, roomId ? "connecting" : "offline");

        // Read before any write can drop it — the store no longer persists
        // elements, so its next write removes them from localStorage.
        const legacy = roomId ? [] : readLegacyElements();
        const seed = roomId ? readRoomSeed(roomId) : [];

        const doc = new Y.Doc();
        const persistence = new IndexeddbPersistence(docNameFor(roomId), doc);

        let cancelled = false;
        let unbind: (() => void) | undefined;
        let disposeUndo: (() => void) | undefined;
        let provider: WebsocketProvider | undefined;
        let stopPresence: (() => void) | undefined;
        let stopFollow: (() => void) | undefined;
        let unreachableTimer: ReturnType<typeof setTimeout> | undefined;

        const start = (initial: Element[]) => {
            // Set the store from this session before binding, rather than
            // relying on the previous session having cleared it. Whatever was
            // on screen a moment ago is not this document's business.
            useStore.getState().replaceAllElements(initial);

            // Order matters: bind first so the initial seed happens, then create
            // the undo manager, so restoring a drawing is not itself undoable.
            unbind = bindStoreToDoc(doc);
            disposeUndo = createUndoManager(doc);

            if (roomId) {
                provider = new WebsocketProvider(relayUrl(), roomId, doc, { connect: true });
                provider.on("status", ({ status }: { status: string }) => {
                    if (cancelled) return;
                    if (status === "connected") {
                        if (unreachableTimer !== undefined) {
                            clearTimeout(unreachableTimer);
                            unreachableTimer = undefined;
                        }
                        useStore.getState().setConnection("connected");
                        return;
                    }
                    // y-websocket retries forever, so "connecting" on its own
                    // never stops being true and says nothing about whether the
                    // relay is there. Give it a few seconds, then say so.
                    if (useStore.getState().connection !== "unreachable") {
                        useStore.getState().setConnection("connecting");
                    }
                    if (unreachableTimer === undefined) {
                        unreachableTimer = setTimeout(() => {
                            unreachableTimer = undefined;
                            if (!cancelled) useStore.getState().setConnection("unreachable");
                        }, UNREACHABLE_AFTER_MS);
                    }
                });
                stopPresence = startPresence(provider.awareness);
                // After presence: the first thing it does is publish a viewport.
                stopFollow = startFollowSync();
            }

            useStore.getState().setDocLoaded(true);
        };

        persistence.whenSynced
            .then(() => {
                if (cancelled) return;

                // A restored document always wins; only seed when it has nothing
                // to say for itself. When it does have content the binding pulls
                // it, so the initial value here is irrelevant.
                const empty = getElementsMap(doc).size === 0;
                let initial: Element[] = [];

                if (legacy.length > 0) {
                    if (empty) initial = legacy;
                    markLegacyImported();
                } else if (empty && seed.length > 0) {
                    initial = seed; // we started this room from our own canvas
                }
                // Consumed only once it has actually been used, so a discarded
                // first effect pass in development cannot swallow it.
                if (roomId) clearRoomSeed(roomId);

                // Expire old tombstones once, before binding, so the store never
                // sees them and the sweep is a single transaction.
                doc.transact(() => gcDocTombstones(getElementsMap(doc)), LOCAL_ORIGIN);

                start(initial);
            })
            .catch(() => {
                // Storage unavailable (private mode, quota). Run in memory rather
                // than leaving the canvas permanently blank.
                if (cancelled) return;
                start(legacy.length > 0 ? legacy : seed);
            });

        return () => {
            cancelled = true;
            if (unreachableTimer !== undefined) clearTimeout(unreachableTimer);
            // Withdraw our presence before dropping the socket, so peers see us
            // leave rather than watching a cursor freeze.
            stopFollow?.();
            stopPresence?.();
            provider?.destroy();
            disposeUndo?.();
            unbind?.();
            persistence.destroy();
            doc.destroy();

            // Only reset shared state if a later session has not already taken
            // over — see activeSession above.
            if (isCurrent()) {
                activeSession = null;
                const s = useStore.getState();
                s.setDocLoaded(false);
                s.setSession(null, "offline");
            }
        };
    }, [roomId]);
}
