import { peerDrafts, isOverlayEmpty } from "./overlay.ts";
import type { Peer } from "./collab/presence.ts";
import type { AppState, Element } from "./types.ts";

/**
 * Tests for what the overlay decides to draw.
 *
 * The load-bearing case is a peer mid-gesture on an element that is already in
 * the document. The scene canvas hides those ids, so if the overlay also
 * declines to draw them the element is invisible to everyone else for the whole
 * duration of the gesture — which is exactly the bug this pins.
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

const el = (id: string, over: Partial<Element> = {}): Element => ({
    id, type: "rectangle", x: 0, y: 0, width: 10, height: 10,
    strokeColor: "#000", backgroundColor: "transparent", strokeWidth: 1,
    roughness: 1, opacity: 100, seed: 1, index: "a0", updatedAt: 1000, version: 1,
    ...over,
});

const peer = (clientId: number, draft: Element[] | null): Peer => ({
    clientId, name: `Peer ${clientId}`, color: "#e03131",
    cursor: null, selection: [], tool: "selection", viewport: null, draft,
});

const appState: AppState = {
    tool: "selection", selection: [], isDragging: false, zoom: 1, scrollX: 0, scrollY: 0,
};

const ids = (els: Element[]) => els.map((e) => e.id).join(",");

console.log("\n# peer drafts");
{
    // The reported bug: A drags a committed element, B sees nothing at all.
    const committed = el("rect-1", { x: 0, y: 0 });
    const dragged = el("rect-1", { x: 200, y: 120, version: 2 });
    const drafts = peerDrafts({ peers: [peer(1, [dragged])] });
    check("a draft for an element already in the document is still drawn",
        ids(drafts) === "rect-1", `got "${ids(drafts)}"`);
    check("and it is the peer's in-flight version, not the committed one",
        drafts[0].x === 200 && drafts[0].y === 120,
        `got x=${drafts[0]?.x} y=${drafts[0]?.y}`);
    check("the committed element is untouched", committed.x === 0);
}

{
    const drafts = peerDrafts({ peers: [peer(1, [el("new-1")])] });
    check("a draft for an element nobody has yet is drawn",
        ids(drafts) === "new-1", `got "${ids(drafts)}"`);
}

{
    const drafts = peerDrafts({ peers: [peer(1, [el("gone", { isDeleted: true })])] });
    check("a tombstoned draft is not drawn", drafts.length === 0, `got ${drafts.length}`);
}

{
    const drafts = peerDrafts({ peers: [peer(1, null), peer(2, [el("b1"), el("b2")])] });
    check("drafts from several peers are collected, skipping those with none",
        ids(drafts) === "b1,b2", `got "${ids(drafts)}"`);
}

{
    check("no peers means nothing to draw", peerDrafts({ peers: [] }).length === 0);
}

console.log("\n# idle overlay");
{
    const empty = { appState, isDarkMode: false, selectionRect: null, elements: [], peers: [] };
    check("an empty scene lets the frame loop park", isOverlayEmpty(empty));
    check("a marquee keeps it awake",
        !isOverlayEmpty({ ...empty, selectionRect: { x: 0, y: 0, width: 5, height: 5 } }));
    check("a peer holding only a draft keeps it awake",
        !isOverlayEmpty({ ...empty, peers: [peer(1, [el("d")])] }));
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"}  ${assertions - failures}/${assertions}`);
if (failures > 0) process.exit(1);
