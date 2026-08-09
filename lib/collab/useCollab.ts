"use client";

import { useEffect } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { useStore } from "@/store/useStore";
import { bindStoreToDoc } from "./binding";
import { getElementsMap, gcDocTombstones, LOCAL_ORIGIN } from "./doc";
import { readLegacyElements, markLegacyImported } from "./legacy";

/** IndexedDB store name for the solo canvas. Shared rooms get their own docs. */
export const LOCAL_DOC_NAME = "doodle-local";

/**
 * Owns the document for this session: creates it, restores it from IndexedDB,
 * and binds it to the store.
 *
 * IndexedDB is asynchronous, unlike the localStorage it replaces, so the store
 * is empty for the first moments after mount. `setDocLoaded` lets the UI tell
 * "nothing drawn yet" apart from "not loaded yet" and avoids flashing the
 * welcome screen over an existing drawing.
 */
export function useCollab(): void {
    const setDocLoaded = useStore((s) => s.setDocLoaded);

    useEffect(() => {
        // Read before any write can drop it — the store no longer persists
        // elements, so its next write removes them from localStorage.
        const legacy = readLegacyElements();

        const doc = new Y.Doc();
        const persistence = new IndexeddbPersistence(LOCAL_DOC_NAME, doc);

        let cancelled = false;
        let unbind: (() => void) | undefined;

        persistence.whenSynced
            .then(() => {
                if (cancelled) return;

                // Only seed from legacy data when the document has nothing to
                // say; a restored document always wins.
                if (legacy.length > 0) {
                    if (getElementsMap(doc).size === 0) {
                        useStore.getState().replaceAllElements(legacy);
                    }
                    markLegacyImported();
                }

                // Expire old tombstones once, before binding, so the store never
                // sees them and the sweep is a single transaction.
                doc.transact(() => gcDocTombstones(getElementsMap(doc)), LOCAL_ORIGIN);

                unbind = bindStoreToDoc(doc);
                setDocLoaded(true);
            })
            .catch(() => {
                // Storage unavailable (private mode, quota). Run in memory
                // rather than leaving the canvas permanently blank.
                if (cancelled) return;
                if (legacy.length > 0) useStore.getState().replaceAllElements(legacy);
                unbind = bindStoreToDoc(doc);
                setDocLoaded(true);
            });

        return () => {
            cancelled = true;
            unbind?.();
            persistence.destroy();
            doc.destroy();
            setDocLoaded(false);
        };
    }, [setDocLoaded]);
}
