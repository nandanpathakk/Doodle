import * as Y from "yjs";
import { useStore, registerUndoHandler, onGestureEnd } from "@/store/useStore";
import { LOCAL_ORIGIN, getElementsMap } from "./doc.ts";

/**
 * Undo over the synced document.
 *
 * The previous implementation snapshotted the whole element list. That cannot
 * work with collaborators: restoring a snapshot would also revert anything they
 * had done since, so pressing undo would delete other people's work. Yjs tracks
 * undo per origin instead, and only LOCAL_ORIGIN — this user's own edits — is
 * tracked, so undo reaches your changes and stops there.
 *
 * Create this *after* binding the store, so the initial seed of the document is
 * not itself undoable.
 */

/**
 * How long consecutive edits keep merging into one undo step. Gestures are
 * bounded explicitly (see stopCapturing below), so this only governs
 * unbracketed bursts — typing into a text element being the one that matters,
 * where per-keystroke undo would be tedious.
 */
const CAPTURE_TIMEOUT_MS = 400;

export function createUndoManager(doc: Y.Doc): () => void {
    const manager = new Y.UndoManager(getElementsMap(doc), {
        trackedOrigins: new Set([LOCAL_ORIGIN]),
        captureTimeout: CAPTURE_TIMEOUT_MS,
    });

    const syncAvailability = () =>
        useStore.getState().setUndoState(manager.canUndo(), manager.canRedo());

    // Remember what was selected when a change was made, so undoing puts the
    // user back in front of what just changed rather than clearing selection.
    const onStackItemAdded = (event: { stackItem: { meta: Map<string, unknown> } }) => {
        event.stackItem.meta.set("selection", useStore.getState().appState.selection);
        syncAvailability();
    };

    const onStackItemPopped = (event: { stackItem: { meta: Map<string, unknown> } }) => {
        const selection = event.stackItem.meta.get("selection");
        if (Array.isArray(selection)) {
            // Elements the undo did not bring back must not stay selected.
            const live = new Set(useStore.getState().elements.map((el) => el.id));
            useStore.getState().setSelection(selection.filter((id: string) => live.has(id)));
        }
        syncAvailability();
    };

    manager.on("stack-item-added", onStackItemAdded);
    manager.on("stack-item-popped", onStackItemPopped);
    manager.on("stack-cleared", syncAvailability);

    // Close the undo step at the end of every gesture. Registered after the
    // binding, so it runs once the gesture's changes have been written — which
    // makes each gesture exactly one undo step regardless of how quickly the
    // next edit follows.
    const unsubscribeGesture = onGestureEnd(() => manager.stopCapturing());

    const unregister = registerUndoHandler({
        undo: () => manager.undo(),
        redo: () => manager.redo(),
    });

    syncAvailability();

    return () => {
        unsubscribeGesture();
        unregister();
        manager.off("stack-item-added", onStackItemAdded);
        manager.off("stack-item-popped", onStackItemPopped);
        manager.off("stack-cleared", syncAvailability);
        manager.destroy();
        useStore.getState().setUndoState(false, false);
    };
}
