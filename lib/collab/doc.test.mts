import * as Y from "yjs";
import {
    LOCAL_ORIGIN, getElementsMap, applyElementsToDoc, docToElements, gcDocTombstones,
} from "./doc.ts";
import { TOMBSTONE_TTL_MS } from "../order.ts";
import type { Element } from "../types.ts";

/**
 * Tests for the document layer: that the store's element list survives a
 * round-trip, that writes stay proportional to what changed, and that two peers
 * converge on the same drawing.
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

/** Write as the local peer would. */
const write = (doc: Y.Doc, elements: Element[]) =>
    doc.transact(() => applyElementsToDoc(getElementsMap(doc), elements), LOCAL_ORIGIN);

console.log("\n# element round-trip");
{
    const doc = new Y.Doc();
    const source = [
        el("a", "a0"),
        el("b", "a1", { type: "pencil", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }),
        el("c", "a2", { type: "text", text: "hello", fontSize: 20, groupId: "g1" }),
    ];
    write(doc, source);
    const out = docToElements(getElementsMap(doc));

    check("all elements survive", ids(out) === "a,b,c", `-> ${ids(out)}`);
    check("scalar fields preserved", out[0].strokeColor === "#000" && out[0].width === 10);
    check("point arrays preserved", JSON.stringify(out[1].points) === JSON.stringify(source[1].points));
    check("optional fields preserved", out[2].text === "hello" && out[2].groupId === "g1");
    check("round-trip is lossless", JSON.stringify(out) === JSON.stringify(source), `-> ${JSON.stringify(out[0])}`);
}

console.log("\n# reads back in z-order, not insertion order");
{
    const doc = new Y.Doc();
    write(doc, [el("c", "a2"), el("a", "a0"), el("b", "a1")]);
    check("sorted by index", ids(docToElements(getElementsMap(doc))) === "a,b,c");
}

console.log("\n# writes are proportional to what changed");
{
    const doc = new Y.Doc();
    const base = [el("a", "a0"), el("b", "a1"), el("c", "a2")];
    write(doc, base);

    let updates = 0;
    doc.on("update", () => updates++);

    write(doc, base);
    check("re-writing identical elements writes nothing", updates === 0, `-> ${updates} updates`);

    // Same values, fresh objects: comparison must be by value, or every gesture
    // would rewrite the whole scene.
    write(doc, base.map((e) => ({ ...e, points: e.points ? [...e.points] : undefined })));
    check("value-equal rewrite writes nothing", updates === 0, `-> ${updates} updates`);

    updates = 0;
    write(doc, [base[0], { ...base[1], x: 999 }, base[2]]);
    check("changing one element writes once", updates === 1, `-> ${updates} updates`);

    const out = docToElements(getElementsMap(doc));
    check("the change landed", out[1].x === 999);
    check("its neighbours are untouched", out[0].x === 0 && out[2].x === 0);
}

console.log("\n# point arrays are compared by value");
{
    const doc = new Y.Doc();
    const stroke = el("p", "a0", { type: "pencil", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
    write(doc, [stroke]);

    let updates = 0;
    doc.on("update", () => updates++);
    write(doc, [{ ...stroke, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }]);
    check("identical points write nothing", updates === 0, `-> ${updates} updates`);

    write(doc, [{ ...stroke, points: [{ x: 1, y: 1 }, { x: 2, y: 9 }] }]);
    check("changed points write once", updates === 1, `-> ${updates} updates`);
    check("new points readable", docToElements(getElementsMap(doc))[0].points?.[1].y === 9);
}

console.log("\n# cleared fields are removed, not left behind");
{
    const doc = new Y.Doc();
    write(doc, [el("a", "a0", { groupId: "g1" })]);
    check("field present", docToElements(getElementsMap(doc))[0].groupId === "g1");

    // Ungrouping sets groupId to undefined.
    write(doc, [el("a", "a0", { groupId: undefined })]);
    const out = docToElements(getElementsMap(doc))[0];
    check("cleared field is gone", !("groupId" in out), `-> ${JSON.stringify(out.groupId)}`);
}

console.log("\n# deletion is a tombstone, not a removal");
{
    const doc = new Y.Doc();
    write(doc, [el("a", "a0"), el("b", "a1")]);
    write(doc, [el("a", "a0"), el("b", "a1", { isDeleted: true, updatedAt: 5000 })]);

    const out = docToElements(getElementsMap(doc));
    check("tombstone retained in the document", out.length === 2);
    check("tombstone is flagged", out[1].isDeleted === true);
    check("its index is retained for restore", out[1].index === "a1");
}

console.log("\n# tombstone GC");
{
    const now = 10 * TOMBSTONE_TTL_MS;
    const doc = new Y.Doc();
    write(doc, [
        el("live", "a0"),
        el("fresh", "a1", { isDeleted: true, updatedAt: now - 1000 }),
        el("stale", "a2", { isDeleted: true, updatedAt: now - TOMBSTONE_TTL_MS - 1 }),
    ]);

    const dropped = doc.transact(() => gcDocTombstones(getElementsMap(doc), now), LOCAL_ORIGIN);
    const out = docToElements(getElementsMap(doc));

    check("one tombstone collected", dropped === 1, `-> ${dropped}`);
    check("live element kept", out.some((e) => e.id === "live"));
    check("fresh tombstone kept", out.some((e) => e.id === "fresh"));
    check("stale tombstone dropped", !out.some((e) => e.id === "stale"));
}

console.log("\n# two peers converge");
{
    const a = new Y.Doc();
    const b = new Y.Doc();
    // Relay updates both ways, as a server would.
    a.on("update", (u, origin) => { if (origin !== "net") Y.applyUpdate(b, u, "net"); });
    b.on("update", (u, origin) => { if (origin !== "net") Y.applyUpdate(a, u, "net"); });

    write(a, [el("shared", "a0", { x: 1 })]);
    check("peer B sees peer A's element", docToElements(getElementsMap(b)).length === 1);

    // Concurrent edits to *different fields* of the same element: both must survive.
    a.transact(() => getElementsMap(a).get("shared")!.set("x", 100), LOCAL_ORIGIN);
    b.transact(() => getElementsMap(b).get("shared")!.set("strokeColor", "#f00"), LOCAL_ORIGIN);

    const fromA = docToElements(getElementsMap(a))[0];
    const fromB = docToElements(getElementsMap(b))[0];
    check("peers converge", JSON.stringify(fromA) === JSON.stringify(fromB), `\n    A=${JSON.stringify(fromA)}\n    B=${JSON.stringify(fromB)}`);
    check("A's field change survived", fromA.x === 100);
    check("B's field change survived", fromA.strokeColor === "#f00");
}

console.log("\n# concurrent edits to the same field settle identically");
{
    const a = new Y.Doc();
    const b = new Y.Doc();
    write(a, [el("shared", "a0")]);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a), "net");

    // Both move the same element while disconnected, then reconnect.
    a.transact(() => getElementsMap(a).get("shared")!.set("x", 111), LOCAL_ORIGIN);
    b.transact(() => getElementsMap(b).get("shared")!.set("x", 222), LOCAL_ORIGIN);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a), "net");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b), "net");

    const xa = docToElements(getElementsMap(a))[0].x;
    const xb = docToElements(getElementsMap(b))[0].x;
    check("no split brain after reconnect", xa === xb, `-> A=${xa} B=${xb}`);
    check("a real value won, not a merge artefact", xa === 111 || xa === 222, `-> ${xa}`);
}

console.log("\n# text merges rather than clobbering");
{
    const text = (doc: Y.Doc, id = "label") =>
        (docToElements(getElementsMap(doc)).find((e) => e.id === id)!.text) ?? "";

    const a = new Y.Doc();
    const b = new Y.Doc();
    write(a, [el("label", "a0", { type: "text", text: "hello world" })]);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a), "net");

    check("text reads back as a plain string", text(a) === "hello world", `-> ${text(a)}`);
    check("it is stored as a Y.Text, not a string",
        getElementsMap(a).get("label")!.get("text") instanceof Y.Text);

    // Both type into the same label while disconnected, at different offsets —
    // exactly the case a whole-string write loses.
    write(a, [el("label", "a0", { type: "text", text: "hello cruel world" })]);
    write(b, [el("label", "a0", { type: "text", text: "hello world!" })]);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a), "net");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b), "net");

    check("both edits survive", text(a) === "hello cruel world!", `-> "${text(a)}"`);
    check("peers agree", text(a) === text(b), `-> A="${text(a)}" B="${text(b)}"`);
}

console.log("\n# text edits are diffed, not rewritten");
{
    const doc = new Y.Doc();
    write(doc, [el("label", "a0", { type: "text", text: "the quick brown fox" })]);
    const yText = getElementsMap(doc).get("label")!.get("text") as Y.Text;

    // Typing one character must not rewrite the line, or every keystroke costs
    // the length of the paragraph and nothing merges.
    let bytes = 0;
    const count = (update: Uint8Array) => { bytes += update.byteLength; };
    doc.on("update", count);
    write(doc, [el("label", "a0", { type: "text", text: "the quick brown foxes" })]);
    doc.off("update", count);

    check("appending a character is a small update", bytes < 60, `-> ${bytes} bytes`);
    check("the Y.Text was edited in place, not replaced",
        getElementsMap(doc).get("label")!.get("text") === yText);
    check("the result is right", yText.toString() === "the quick brown foxes", `-> ${yText}`);

    // An edit in the middle keeps both ends.
    write(doc, [el("label", "a0", { type: "text", text: "the slow brown foxes" })]);
    check("replacing a word in the middle", yText.toString() === "the slow brown foxes", `-> ${yText}`);

    write(doc, [el("label", "a0", { type: "text", text: "" })]);
    check("clearing it works", yText.toString() === "", `-> "${yText}"`);
}

console.log("\n# text written before it was collaborative");
{
    // A document from an older build holds a plain string. It must still read,
    // and become a Y.Text the first time it is written.
    const doc = new Y.Doc();
    const yElements = getElementsMap(doc);
    doc.transact(() => {
        const m = new Y.Map<unknown>();
        for (const [k, v] of Object.entries(el("legacy", "a0", { type: "text", text: "old" }))) {
            m.set(k, v);
        }
        yElements.set("legacy", m);
    }, LOCAL_ORIGIN);

    check("a plain string still reads",
        docToElements(yElements)[0].text === "old", `-> ${docToElements(yElements)[0].text}`);

    write(doc, [el("legacy", "a0", { type: "text", text: "old and new" })]);
    check("writing upgrades it", yElements.get("legacy")!.get("text") instanceof Y.Text);
    check("without losing anything",
        docToElements(yElements)[0].text === "old and new", `-> ${docToElements(yElements)[0].text}`);
}

console.log("\n# emoji are not cut in half");
{
    const doc = new Y.Doc();
    // Astral characters are two UTF-16 code units, and Yjs indexes code units.
    write(doc, [el("label", "a0", { type: "text", text: "ok 👍" })]);
    write(doc, [el("label", "a0", { type: "text", text: "ok 👍👍" })]);
    const out = docToElements(getElementsMap(doc))[0].text!;
    check("appending one leaves both intact", out === "ok 👍👍", `-> "${out}"`);
    check("no replacement characters", !out.includes("�"), `-> "${out}"`);

    write(doc, [el("label", "a0", { type: "text", text: "ok 👍" })]);
    const back = docToElements(getElementsMap(doc))[0].text!;
    check("and removing one does too", back === "ok 👍", `-> "${back}"`);
}

console.log(
    failures === 0
        ? `\n${assertions} assertions, all passed\n`
        : `\n${failures} of ${assertions} assertions FAILED\n`
);
process.exit(failures ? 1 : 0);
