import {
    sortByIndex, normalizeIndices, appendOnTop, indexOnTop, reindexToOrder, compareIndex,
    gcTombstones, TOMBSTONE_TTL_MS,
} from "./order.ts";
import type { Element } from "./types.ts";

/**
 * Tests for the ordering rules that z-order and tombstones depend on.
 * Run with `npm test` — Node executes TypeScript directly, so this needs no
 * test framework and adds no dependency.
 */

let failures = 0;
let assertions = 0;

const check = (name: string, cond: boolean, extra = "") => {
    assertions++;
    if (!cond) { failures++; console.log(`  FAIL  ${name} ${extra}`); }
    else console.log(`  ok    ${name}`);
};

/** Invariant check used inside loops: silent unless it fails. */
const invariant = (name: string, cond: boolean, extra = "") => {
    assertions++;
    if (!cond) { failures++; console.log(`  FAIL  ${name} ${extra}`); }
};

const el = (id: string, index = ""): Element => ({
    updatedAt: 0,
    id, type: "rectangle", x: 0, y: 0, width: 10, height: 10,
    strokeColor: "#000", backgroundColor: "transparent", strokeWidth: 1,
    roughness: 1, opacity: 100, seed: 1, index, version: 1,
});

const ids = (els: Element[]) => els.map((e) => e.id).join(",");
const isSorted = (els: Element[]) =>
    els.every((e, i) => i === 0 || compareIndex(els[i - 1], e) < 0);
const unique = (els: Element[]) => new Set(els.map((e) => e.index)).size === els.length;

// Mirrors store.moveSelection's target-order computation (unchanged by this work),
// so we test the exact arrays reindexToOrder receives in production.
const targetOrder = (els: Element[], sel: Set<string>, dir: string): Element[] => {
    if (dir === "front") return [...els.filter((e) => !sel.has(e.id)), ...els.filter((e) => sel.has(e.id))];
    if (dir === "back") return [...els.filter((e) => sel.has(e.id)), ...els.filter((e) => !sel.has(e.id))];
    const next = [...els];
    const order = dir === "forward" ? [...next.keys()].reverse() : [...next.keys()];
    for (const i of order) {
        if (!sel.has(next[i].id)) continue;
        const swapWith = dir === "forward" ? i + 1 : i - 1;
        if (swapWith < 0 || swapWith >= next.length) continue;
        if (sel.has(next[swapWith].id)) continue;
        [next[i], next[swapWith]] = [next[swapWith], next[i]];
    }
    return next;
};

const move = (els: Element[], selIds: string[], dir: string) => {
    const sel = new Set(selIds);
    const out = reindexToOrder(targetOrder(els, sel, dir), sel);
    invariant(`sorted after ${dir} [${selIds}]`, isSorted(out), `-> ${ids(out)}`);
    invariant(`unique after ${dir} [${selIds}]`, unique(out));
    return out;
};

console.log("\n# migration of legacy (index-less) data");
{
    const legacy = ["a", "b", "c", "d"].map((id) => el(id));
    const out = normalizeIndices(legacy);
    check("preserves array order", ids(out) === "a,b,c,d", `-> ${ids(out)}`);
    check("all indexed", out.every((e) => !!e.index));
    check("sorted + unique", isSorted(out) && unique(out));
}

console.log("\n# partial / duplicate indices are rebuilt");
{
    const mixed = [el("a", "a0"), el("b"), el("c", "a1")];
    const out = normalizeIndices(mixed);
    check("rebuilds, keeping order", ids(out) === "a,b,c" && isSorted(out) && unique(out), `-> ${ids(out)}`);

    const dupes = [el("a", "a0"), el("b", "a0"), el("c", "a1")];
    const out2 = normalizeIndices(dupes);
    check("collisions rebuilt", isSorted(out2) && unique(out2) && ids(out2) === "a,b,c");
}

console.log("\n# already-indexed data is sorted, not rebuilt");
{
    const base = normalizeIndices(["a", "b", "c"].map((id) => el(id)));
    const shuffled = [base[2], base[0], base[1]];
    const out = normalizeIndices(shuffled);
    check("index wins over array order", ids(out) === "a,b,c", `-> ${ids(out)}`);
    check("keys untouched", out.every((e, i) => e.index === base[i].index));
}

console.log("\n# z-order operations");
{
    const base = normalizeIndices(["a", "b", "c", "d", "e"].map((id) => el(id)));

    check("front: single", ids(move(base, ["b"], "front")) === "a,c,d,e,b");
    check("back:  single", ids(move(base, ["d"], "back")) === "d,a,b,c,e");
    check("front: multi keeps relative order", ids(move(base, ["b", "d"], "front")) === "a,c,e,b,d");
    check("back:  multi keeps relative order", ids(move(base, ["b", "d"], "back")) === "b,d,a,c,e");

    check("forward:  single", ids(move(base, ["b"], "forward")) === "a,c,b,d,e");
    check("backward: single", ids(move(base, ["c"], "backward")) === "a,c,b,d,e");
    check("forward:  top element is a no-op", ids(move(base, ["e"], "forward")) === "a,b,c,d,e");
    check("backward: bottom element is a no-op", ids(move(base, ["a"], "backward")) === "a,b,c,d,e");

    check("forward:  adjacent pair moves together", ids(move(base, ["b", "c"], "forward")) === "a,d,b,c,e");
    check("backward: adjacent pair moves together", ids(move(base, ["c", "d"], "backward")) === "a,c,d,b,e");
    check("forward:  disjoint pair", ids(move(base, ["a", "c"], "forward")) === "b,a,d,c,e");

    check("select-all front is a no-op", ids(move(base, ["a", "b", "c", "d", "e"], "front")) === "a,b,c,d,e");
}

console.log("\n# repeated reordering does not degrade");
{
    let els = normalizeIndices(["a", "b", "c", "d"].map((id) => el(id)));
    for (let i = 0; i < 200; i++) {
        els = move(els, ["b"], i % 2 ? "forward" : "backward").filter(Boolean);
        if (!isSorted(els) || !unique(els)) { check("stayed valid", false, `iter ${i}`); break; }
    }
    const longest = Math.max(...els.map((e) => e.index.length));
    check("200 reorders stay valid", isSorted(els) && unique(els));
    check("key length stays bounded", longest < 30, `longest=${longest}`);
}

console.log("\n# clones never collide with their source");
{
    const base = normalizeIndices(["a", "b", "c"].map((id) => el(id)));
    const clones = [el("a2", base[0].index), el("c2", base[2].index)];
    const out = appendOnTop(base, clones);
    check("clones re-keyed above everything", ids(out) === "a,b,c,a2,c2", `-> ${ids(out)}`);
    check("sorted + unique", isSorted(out) && unique(out));
}

console.log("\n# new elements land on top");
{
    let els = normalizeIndices(["a", "b"].map((id) => el(id)));
    const fresh = el("z", indexOnTop(els));
    els = sortByIndex([...els, fresh]);
    check("new element is topmost", ids(els) === "a,b,z", `-> ${ids(els)}`);
    check("empty canvas works", !!indexOnTop([]));
}

console.log("\n# tombstone GC");
{
    const now = 1_000_000_000_000;
    const mk = (id: string, isDeleted: boolean, ageMs: number) =>
        ({ ...el(id, id), isDeleted, updatedAt: now - ageMs });

    const out = gcTombstones([
        mk("live-old", false, TOMBSTONE_TTL_MS * 10),   // live, ancient -> kept
        mk("dead-fresh", true, 1000),                    // deleted 1s ago -> kept
        mk("dead-stale", true, TOMBSTONE_TTL_MS + 1),    // past TTL -> dropped
        mk("dead-edge", true, TOMBSTONE_TTL_MS - 1),     // just inside TTL -> kept
    ], now);

    check("live elements are never GC'd", out.some((e) => e.id === "live-old"));
    check("fresh tombstone kept", out.some((e) => e.id === "dead-fresh"));
    check("tombstone just inside TTL kept", out.some((e) => e.id === "dead-edge"));
    check("stale tombstone dropped", !out.some((e) => e.id === "dead-stale"));

    // Elements written before updatedAt existed must not be treated as ancient
    // unless they are actually tombstones.
    const legacyLive = { ...el("legacy", "a0") } as Element;
    delete (legacyLive as Partial<Element>).updatedAt;
    check("legacy live element survives GC", gcTombstones([legacyLive], now).length === 1);
}

console.log("\n# z-order ignores tombstones");
{
    // A tombstone sitting between two visible elements must not absorb a
    // one-step move: ordering is computed over visible elements only.
    const all = normalizeIndices(["a", "ghost", "b"].map((id) => el(id)));
    const withGhost = all.map((e) => e.id === "ghost" ? { ...e, isDeleted: true } : e);
    const live = withGhost.filter((e) => !e.isDeleted);

    const sel = new Set(["a"]);
    const target = targetOrder(live, sel, "forward");
    const reordered = reindexToOrder(target, sel);
    const byId = new Map(reordered.map((e) => [e.id, e]));
    const merged = sortByIndex(withGhost.map((e) => byId.get(e.id) ?? e));

    check("visible order swaps in one step",
        ids(merged.filter((e) => !e.isDeleted)) === "b,a",
        `-> ${ids(merged.filter((e) => !e.isDeleted))}`);
    check("tombstone retained through the reorder", merged.some((e) => e.id === "ghost"));
}

console.log(
    failures === 0
        ? `\n${assertions} assertions, all passed\n`
        : `\n${failures} of ${assertions} assertions FAILED\n`
);
process.exit(failures ? 1 : 0);
