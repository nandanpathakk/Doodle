import * as Y from "yjs";
import { bindStoreToDoc } from "./binding.ts";
import { LOCAL_ORIGIN, getElementsMap, applyElementsToDoc, docToElements } from "./doc.ts";
import { useStore } from "@/store/useStore";
import type { Element } from "../types.ts";

/**
 * Tests for the store <-> document binding.
 *
 * The hazard this exists to catch is a feedback loop: `updateElement` bumps
 * `version` on every pointer move, so if a write came back through the observer
 * and was re-applied to the store, it would write to the document again without
 * end. Several tests below assert on *counts* of document updates rather than
 * just final state, because a loop converges to the right answer while still
 * writing forever.
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

const ids = (els: Element[]) => els.map((e) => e.id).join(",");
const storeIds = () => ids(useStore.getState().allElements);
const reset = () => useStore.getState().replaceAllElements([]);

/** A peer's edit arriving over the network: applied with a foreign origin. */
const remoteEdit = (doc: Y.Doc, mutate: (peer: Y.Doc) => void) => {
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    mutate(peer);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer), "network");
};

console.log("\n# local edits reach the document");
{
    reset();
    const doc = new Y.Doc();
    const unbind = bindStoreToDoc(doc);

    useStore.getState().addElement(el("a", "a0"));
    check("added element is in the document", ids(docToElements(getElementsMap(doc))) === "a");

    useStore.getState().updateElement("a", { x: 42 });
    check("update reaches the document", docToElements(getElementsMap(doc))[0].x === 42);

    useStore.getState().removeElement("a");
    const after = docToElements(getElementsMap(doc));
    check("delete is a tombstone, not a removal", after.length === 1 && after[0].isDeleted === true);

    unbind();
}

console.log("\n# remote edits reach the store");
{
    reset();
    const doc = new Y.Doc();
    const unbind = bindStoreToDoc(doc);

    remoteEdit(doc, (peer) => {
        peer.transact(() => applyElementsToDoc(getElementsMap(peer), [el("r1", "a0"), el("r2", "a1")]));
    });
    check("store received both elements", storeIds() === "r1,r2", `-> ${storeIds()}`);

    remoteEdit(doc, (peer) => {
        peer.transact(() => getElementsMap(peer).get("r1")!.set("x", 77));
    });
    check("store received the field change", useStore.getState().allElements[0].x === 77);

    unbind();
}

console.log("\n# a remote edit does not echo back into the document");
{
    reset();
    const doc = new Y.Doc();
    const unbind = bindStoreToDoc(doc);

    let updates = 0;
    doc.on("update", () => updates++);

    remoteEdit(doc, (peer) => {
        peer.transact(() => applyElementsToDoc(getElementsMap(peer), [el("x", "a0")]));
    });

    // Exactly one: the remote update itself. A second would be our write-back,
    // which is the first turn of an endless loop.
    check("remote edit produces exactly one document update", updates === 1, `-> ${updates}`);
    check("store still converged", storeIds() === "x", `-> ${storeIds()}`);

    unbind();
}

console.log("\n# repeated remote edits stay linear");
{
    reset();
    const doc = new Y.Doc();
    const unbind = bindStoreToDoc(doc);

    remoteEdit(doc, (peer) => {
        peer.transact(() => applyElementsToDoc(getElementsMap(peer), [el("x", "a0")]));
    });

    let updates = 0;
    doc.on("update", () => updates++);
    for (let i = 1; i <= 10; i++) {
        remoteEdit(doc, (peer) => {
            peer.transact(() => getElementsMap(peer).get("x")!.set("x", i));
        });
    }

    check("10 remote edits produce 10 updates, not a cascade", updates === 10, `-> ${updates}`);
    check("final value applied", useStore.getState().allElements[0].x === 10);

    unbind();
}

console.log("\n# a gesture is one document update, not one per pointer move");
{
    reset();
    const doc = new Y.Doc();
    const unbind = bindStoreToDoc(doc);
    const store = useStore.getState();

    store.addElement(el("g", "a0"));

    let updates = 0;
    doc.on("update", () => updates++);

    store.beginGesture();
    for (let i = 0; i < 50; i++) store.updateElement("g", { x: i });
    check("mid-gesture edits are not written", updates === 0, `-> ${updates} updates`);

    store.commitGesture();
    check("commit writes exactly once", updates === 1, `-> ${updates} updates`);
    check("the document has the final position", docToElements(getElementsMap(doc))[0].x === 49);

    unbind();
}

console.log("\n# binding to a document that already has content");
{
    reset();
    const doc = new Y.Doc();
    // A restored document, as IndexedDB would hand back on reload.
    doc.transact(() => applyElementsToDoc(getElementsMap(doc), [el("kept", "a0")]), LOCAL_ORIGIN);

    // The store is empty at this point — binding the wrong way round here would
    // push that emptiness over the document and wipe the drawing.
    check("store starts empty", storeIds() === "");
    const unbind = bindStoreToDoc(doc);

    check("document content is preserved", ids(docToElements(getElementsMap(doc))) === "kept");
    check("store is seeded from the document", storeIds() === "kept", `-> ${storeIds()}`);

    unbind();
}

console.log("\n# binding an empty document seeds it from the store");
{
    reset();
    useStore.getState().replaceAllElements([el("seed", "a0")]);

    const doc = new Y.Doc();
    const unbind = bindStoreToDoc(doc);
    check("document seeded from the store", ids(docToElements(getElementsMap(doc))) === "seed");

    unbind();
}

console.log("\n# unbinding stops both directions");
{
    reset();
    const doc = new Y.Doc();
    const unbind = bindStoreToDoc(doc);
    useStore.getState().addElement(el("before", "a0"));
    unbind();

    useStore.getState().addElement(el("after", "a1"));
    check("store edits no longer reach the document",
        ids(docToElements(getElementsMap(doc))) === "before",
        `-> ${ids(docToElements(getElementsMap(doc)))}`);

    remoteEdit(doc, (peer) => {
        peer.transact(() => getElementsMap(peer).get("before")!.set("x", 5));
    });
    check("document edits no longer reach the store",
        useStore.getState().allElements.find((e) => e.id === "before")?.x === 0);
}

console.log(
    failures === 0
        ? `\n${assertions} assertions, all passed\n`
        : `\n${failures} of ${assertions} assertions FAILED\n`
);
process.exit(failures ? 1 : 0);
