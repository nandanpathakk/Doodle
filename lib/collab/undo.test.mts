import * as Y from "yjs";
import { bindStoreToDoc } from "./binding.ts";
import { createUndoManager } from "./undo.ts";
import { getElementsMap, applyElementsToDoc, docToElements } from "./doc.ts";
import { useStore } from "@/store/useStore";
import type { Element } from "../types.ts";

/**
 * Tests for per-user undo.
 *
 * The property that matters is negative: undo must not reach a collaborator's
 * edits. The previous snapshot-based history would have reverted them, since
 * restoring a whole element list silently discards anything that arrived after
 * the snapshot. Most of what follows checks that this no longer happens.
 *
 * Run with `npm test`.
 */

let failures = 0;
let assertions = 0;
const check = (name: string, cond: boolean, extra = "") => {
    assertions++;
    if (!cond) { failures++; console.log(`  FAIL  ${name} ${extra}`); }
    else console.log(`  ok    ${name}`);
};

const el = (id: string, index: string, over: Partial<Element> = {}): Element => ({
    id, type: "rectangle", x: 0, y: 0, width: 10, height: 10,
    strokeColor: "#000", backgroundColor: "transparent", strokeWidth: 1,
    roughness: 1, opacity: 100, seed: 1, index, updatedAt: 1000, version: 1,
    ...over,
});

const store = () => useStore.getState();
const byId = (id: string) => store().allElements.find((e) => e.id === id);
const ids = () => store().allElements.map((e) => e.id).join(",");

/** Bracket an edit as a gesture, which is how every canvas edit reaches the document. */
const asGesture = (fn: () => void) => {
    store().beginGesture();
    fn();
    store().commitGesture();
};

/** A peer's edit arriving over the network: applied with a foreign origin. */
const remoteEdit = (doc: Y.Doc, mutate: (peer: Y.Doc) => void) => {
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    mutate(peer);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer), "network");
};

const setup = () => {
    store().replaceAllElements([]);
    const doc = new Y.Doc();
    const unbind = bindStoreToDoc(doc);
    const disposeUndo = createUndoManager(doc);
    return { doc, dispose: () => { disposeUndo(); unbind(); } };
};

console.log("\n# undo and redo a local edit");
{
    const { doc, dispose } = setup();

    asGesture(() => store().addElement(el("a", "a0")));
    check("element added", ids() === "a");
    check("undo becomes available", store().canUndo === true);

    store().undo();
    check("undo removes it", ids() === "", `-> ${ids()}`);
    check("redo becomes available", store().canRedo === true);

    store().redo();
    check("redo restores it", ids() === "a", `-> ${ids()}`);
    check("document agrees", docToElements(getElementsMap(doc)).length === 1);

    dispose();
}

console.log("\n# undo never touches a collaborator's edits");
{
    const { doc, dispose } = setup();

    remoteEdit(doc, (peer) => {
        peer.transact(() => applyElementsToDoc(getElementsMap(peer), [el("theirs", "a0")]));
    });
    check("their element arrived", ids() === "theirs", `-> ${ids()}`);
    check("nothing of ours to undo", store().canUndo === false);

    // Undo with only remote history must do nothing at all.
    store().undo();
    check("undo does not remove their element", ids() === "theirs", `-> ${ids()}`);

    dispose();
}

console.log("\n# undoing our edit leaves theirs alone");
{
    const { doc, dispose } = setup();

    remoteEdit(doc, (peer) => {
        peer.transact(() => applyElementsToDoc(getElementsMap(peer), [el("theirs", "a0")]));
    });
    asGesture(() => store().addElement(el("ours", "a1")));
    check("both present", ids() === "theirs,ours", `-> ${ids()}`);

    store().undo();
    check("ours is gone", !byId("ours"));
    check("theirs survives", !!byId("theirs"), `-> ${ids()}`);

    dispose();
}

console.log("\n# undoing our move leaves their concurrent move alone");
{
    const { doc, dispose } = setup();

    asGesture(() => {
        store().addElement(el("mine", "a0"));
        store().addElement(el("theirs", "a1"));
    });

    asGesture(() => store().updateElement("mine", { x: 500 }));
    remoteEdit(doc, (peer) => {
        peer.transact(() => getElementsMap(peer).get("theirs")!.set("x", 900));
    });

    check("our move applied", byId("mine")?.x === 500);
    check("their move applied", byId("theirs")?.x === 900);

    store().undo();
    check("our move reverted", byId("mine")?.x === 0, `-> ${byId("mine")?.x}`);
    check("their move untouched", byId("theirs")?.x === 900, `-> ${byId("theirs")?.x}`);

    dispose();
}

console.log("\n# a gesture is one undo step");
{
    const { doc, dispose } = setup();

    asGesture(() => store().addElement(el("g", "a0", { x: 0 })));

    store().beginGesture();
    for (let i = 1; i <= 50; i++) store().updateElement("g", { x: i });
    store().commitGesture();
    check("drag applied", byId("g")?.x === 50);

    store().undo();
    check("one undo reverts the whole drag", byId("g")?.x === 0, `-> ${byId("g")?.x}`);
    check("the element itself survives", !!byId("g"));

    dispose();
}

console.log("\n# undo restores a deleted element");
{
    const { doc, dispose } = setup();

    asGesture(() => store().addElement(el("d", "a0")));
    asGesture(() => store().removeElement("d"));
    check("deleted from view", store().elements.length === 0);
    check("tombstone retained", byId("d")?.isDeleted === true);

    store().undo();
    check("undo brings it back", store().elements.some((e) => e.id === "d"), `-> ${ids()}`);
    check("index preserved", byId("d")?.index === "a0");

    dispose();
}

console.log("\n# restoring a drawing is not itself undoable");
{
    store().replaceAllElements([]);
    const doc = new Y.Doc();
    // A document restored from storage, as on reload.
    doc.transact(() => applyElementsToDoc(getElementsMap(doc), [el("restored", "a0")]));

    const unbind = bindStoreToDoc(doc);
    const disposeUndo = createUndoManager(doc);

    check("drawing loaded", ids() === "restored");
    check("nothing to undo on a fresh load", store().canUndo === false);

    store().undo();
    check("undo cannot erase a restored drawing", ids() === "restored", `-> ${ids()}`);

    disposeUndo();
    unbind();
}

console.log(
    failures === 0
        ? `\n${assertions} assertions, all passed\n`
        : `\n${failures} of ${assertions} assertions FAILED\n`
);
process.exit(failures ? 1 : 0);
