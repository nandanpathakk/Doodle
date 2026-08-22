import * as Y from "yjs";
import { useStore, isGestureActive, onGestureEnd, getGestureTouchedIds } from "@/store/useStore";
import {
    LOCAL_ORIGIN,
    applyElementsToDoc,
    docToElements,
    getElementsMap,
} from "./doc";
import { draftGeometry } from "@/lib/simplify";
import { publishDraft } from "./presence";

/**
 * Two-way binding between the Zustand store (what the UI reads) and the Yjs
 * document (what syncs and persists).
 *
 * The loop hazard is the whole problem here. `updateElement` bumps `version` on
 * every pointer move, so if a write we made came back through the observer and
 * was re-applied to the store, that would write to the document again, forever.
 * Three things prevent it, deliberately overlapping:
 *
 *  1. Local writes are tagged with LOCAL_ORIGIN; the observer ignores them.
 *  2. While applying a document change to the store, pushes are suppressed.
 *  3. Pushes diff against the document, so a redundant push writes nothing —
 *     the loop cannot sustain itself even if 1 and 2 were both bypassed.
 */
export function bindStoreToDoc(doc: Y.Doc): () => void {
    const yElements = getElementsMap(doc);
    let applyingRemote = false;

    const pushToDoc = () => {
        if (applyingRemote) return;
        const { allElements } = useStore.getState();
        doc.transact(() => applyElementsToDoc(yElements, allElements), LOCAL_ORIGIN);
    };

    const pullFromDoc = () => {
        applyingRemote = true;
        try {
            useStore.getState().replaceAllElements(docToElements(yElements));
        } finally {
            applyingRemote = false;
        }
    };

    // Seed before subscribing, and mind the direction: an empty store must never
    // be pushed over a document that already has content, which is exactly what
    // would happen on reload if this ran the other way round.
    if (yElements.size > 0) pullFromDoc();
    else pushToDoc();

    const observer = (_events: unknown, transaction: Y.Transaction) => {
        if (transaction.origin === LOCAL_ORIGIN) return; // our own write echoing back
        pullFromDoc();
    };
    yElements.observeDeep(observer);

    const unsubscribeStore = useStore.subscribe((state, prev) => {
        if (state.allElements === prev.allElements) return;

        // Mid-gesture edits stay out of the document; onGestureEnd flushes them
        // as one transaction. Without this a drag would write once per pointer
        // move. They go over presence instead, so peers watch the work happen
        // rather than waiting for the pointer to be released.
        if (isGestureActive()) {
            const touched = getGestureTouchedIds();
            if (touched.size > 0) {
                // Thinned before it goes out, or a stroke costs the square of
                // its length on the wire — see draftGeometry. The store keeps
                // every point; only the preview peers watch is reduced.
                publishDraft(draftGeometry(
                    state.allElements.filter((el) => touched.has(el.id)),
                    state.appState.zoom,
                ));
            }
            return;
        }

        pushToDoc();
    });

    const unsubscribeGesture = onGestureEnd(() => {
        pushToDoc();
        // Clear only after the real elements are in the document, so the draft
        // is never withdrawn before what replaces it exists.
        publishDraft(null);
    });

    return () => {
        unsubscribeStore();
        unsubscribeGesture();
        yElements.unobserveDeep(observer);
    };
}
