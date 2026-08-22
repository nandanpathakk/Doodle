import * as Y from "yjs";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import { generateNKeysBetween } from "fractional-indexing";
import { startRelay } from "../server/relay.ts";
import { LOCAL_ORIGIN, getElementsMap, applyElementsToDoc } from "../lib/collab/doc.ts";
import { draftGeometry } from "../lib/simplify.ts";
import type { Element, Point } from "../lib/types.ts";

/**
 * Load test for the relay and the sync layer.
 *
 * The question this answers is what a *heavy* room costs — how long a peer
 * waits to be caught up, how much a single edit costs once the document is
 * large, and how much bandwidth six people moving their cursors actually use.
 * None of that is visible in the unit tests, which all run one or two nearly
 * empty documents.
 *
 * It does not measure frame time. That lives in the browser, where the scene
 * canvas and RoughJS are, and neither exists here — run with `--hold` and
 * measure it there. See §7 of docs/collaboration.md.
 *
 *   npm run loadtest
 *   npm run loadtest -- --elements=5000 --peers=10
 *   npm run loadtest -- --url=ws://localhost:1234 --room=loadtest --hold=120
 *
 * Deliberately not a `*.test.mts`: it takes tens of seconds and reports
 * measurements rather than asserting on them, so it has no business in the
 * suite that runs before every commit.
 */

// --- Options -----------------------------------------------------------------

const arg = (name: string, fallback: string): string => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const ELEMENTS = Number(arg("elements", "2000"));
const PEERS = Number(arg("peers", "6"));
const CURSOR_HZ = Number(arg("hz", "30"));
const CURSOR_SECONDS = Number(arg("seconds", "10"));
/** Seconds to stay connected afterwards, so a browser can join the room. */
const HOLD = Number(arg("hold", "0"));
/** An external relay to use instead of starting one — e.g. the one `npm run server` runs. */
const EXTERNAL_URL = arg("url", "");
const ROOM = arg("room", "loadtest");

// --- Byte counting -------------------------------------------------------------

/**
 * Bytes on the wire, per socket, so the report can separate the one-off cost of
 * being caught up from the steady cost of everyone moving about.
 */
interface Counters { sent: number; received: number; messages: number }

/**
 * Every socket opened, in order. y-websocket does not expose the one it built
 * in a way that is stable to look up, and connecting a peer is the only thing
 * that opens a socket, so the last entry is unambiguous immediately after a
 * `connect()`.
 */
const sockets: CountingWebSocket[] = [];
const lastSocket = () => sockets[sockets.length - 1];

const sizeOf = (data: unknown): number => {
    if (typeof data === "string") return Buffer.byteLength(data);
    if (data instanceof ArrayBuffer) return data.byteLength;
    if (ArrayBuffer.isView(data)) return data.byteLength;
    if (Array.isArray(data)) return data.reduce((n, d) => n + sizeOf(d), 0);
    return 0;
};

/**
 * A WebSocket that tallies what passes through it.
 *
 * y-websocket takes the class rather than an instance, so this is the only
 * place to hook. Counting here rather than in the relay means the numbers
 * include the framing a real peer would pay for.
 */
class CountingWebSocket extends WebSocket {
    readonly counters: Counters = { sent: 0, received: 0, messages: 0 };

    constructor(address: string, protocols?: string | string[]) {
        super(address, protocols);
        sockets.push(this);
        this.on("message", (data: unknown) => {
            this.counters.received += sizeOf(data);
            this.counters.messages++;
        });
    }

    send(data: unknown, ...rest: unknown[]): void {
        this.counters.sent += sizeOf(data);
        // @ts-expect-error — forwarding ws's several overloads unchanged
        super.send(data, ...rest);
    }
}

/** Across every peer, which is what a room costs in total. */
const totals = () => {
    let sent = 0, received = 0, messages = 0;
    for (const s of sockets) { sent += s.counters.sent; received += s.counters.received; messages += s.counters.messages; }
    return { sent, received, messages };
};

const resetCounters = () => {
    for (const s of sockets) { s.counters.sent = 0; s.counters.received = 0; s.counters.messages = 0; }
};

// --- Helpers ------------------------------------------------------------------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const until = async (predicate: () => boolean, timeoutMs = 60_000): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return true;
        await wait(10);
    }
    return predicate();
};

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;
const ms = (n: number) => `${n.toFixed(0)} ms`;

/**
 * A drawing of the kind that gets heavy: mostly shapes, one in five a pencil
 * stroke of the size simplification leaves behind. Made deterministic so two
 * runs are comparable.
 */
const makeElements = (count: number): Element[] => {
    let seed = 20250810;
    const rand = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
    const indices = generateNKeysBetween(null, null, count);
    const types = ["rectangle", "circle", "diamond"] as const;

    return Array.from({ length: count }, (_, i) => {
        const isStroke = i % 5 === 0;
        const x = Math.round(rand() * 8000);
        const y = Math.round(rand() * 6000);
        let points: Point[] | undefined;
        if (isStroke) {
            points = Array.from({ length: 31 }, (_, p) => ({
                x: x + Math.round(Math.cos(p / 5) * 60),
                y: y + Math.round(Math.sin(p / 5) * 60),
            }));
        }
        return {
            id: `el-${i}`,
            type: isStroke ? "pencil" : types[i % 3],
            x, y, width: 120, height: 80,
            strokeColor: "#1e1e1e", backgroundColor: "transparent",
            strokeWidth: 2, roughness: 1, opacity: 100,
            seed: Math.floor(rand() * 2 ** 31),
            index: indices[i],
            updatedAt: 1_700_000_000_000 + i,
            version: 1,
            ...(points ? { points } : {}),
        } as Element;
    });
};

// --- Run ------------------------------------------------------------------------

const relay = EXTERNAL_URL ? null : await startRelay({ port: 0, host: "127.0.0.1" });
const url = EXTERNAL_URL || `ws://127.0.0.1:${relay!.port}`;

console.log(`\nRelay      ${url}${relay ? " (started here)" : " (already running)"}`);
console.log(`Room       ${ROOM}`);
console.log(`Load       ${ELEMENTS} elements, ${PEERS} peers, cursors at ${CURSOR_HZ}Hz for ${CURSOR_SECONDS}s\n`);

const connect = (room: string) => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(url, room, doc, {
        WebSocketPolyfill: CountingWebSocket as unknown as typeof globalThis.WebSocket,
        // Without this every peer here syncs through BroadcastChannel instead,
        // because they share a process — and the relay measures as instant and
        // free. In the browser that channel is a feature (two tabs of the same
        // origin sync locally); here it measures the wrong thing entirely.
        disableBc: true,
    });
    return { doc, provider };
};

const elements = makeElements(ELEMENTS);
const author = connect(ROOM);
const authorSocket = lastSocket();
if (!(await until(() => author.provider.wsconnected, 10_000))) {
    console.error(`Could not reach the relay at ${url}. Is \`npm run server\` running?`);
    process.exit(1);
}

// 1. Writing the document -------------------------------------------------------

resetCounters();
const writeStart = Date.now();
author.doc.transact(() => applyElementsToDoc(getElementsMap(author.doc), elements), LOCAL_ORIGIN);
const writeMs = Date.now() - writeStart;
await wait(500); // let the update drain to the relay
const afterWrite = totals();

console.log("1. Building the document");
console.log(`   apply ${ELEMENTS} elements        ${ms(writeMs)}`);
console.log(`   encoded document size          ${kb(Y.encodeStateAsUpdate(author.doc).byteLength)}`);
console.log(`   uploaded to the relay          ${kb(afterWrite.sent)}\n`);

// 2. Catching a late joiner up ---------------------------------------------------

resetCounters();
const joinStart = Date.now();
const joiner = connect(ROOM);
const joinerSocket = lastSocket();
const caughtUp = await until(() => getElementsMap(joiner.doc).size === ELEMENTS, 60_000);
const joinMs = Date.now() - joinStart;
const joinBytes = joinerSocket.counters.received;

console.log("2. A peer joining a room this size");
console.log(`   caught up                      ${caughtUp ? ms(joinMs) : "TIMED OUT"}`);
console.log(`   received                       ${kb(joinBytes)}\n`);

// 3. One edit in a large document ------------------------------------------------

// One somewhere in the middle, so it is neither the first nor the last thing
// written and has no special standing in the document.
const EDITED_ID = `el-${Math.floor(ELEMENTS / 2)}`;

resetCounters();
const editStart = Date.now();
author.doc.transact(() => getElementsMap(author.doc).get(EDITED_ID)!.set("x", 4242), LOCAL_ORIGIN);
const propagated = await until(
    () => (getElementsMap(joiner.doc).get(EDITED_ID)?.get("x") as number) === 4242, 10_000
);
const editMs = Date.now() - editStart;
const editBytes = totals().sent;

console.log("3. Moving one element, with the whole document loaded");
console.log(`   reached the other peer         ${propagated ? ms(editMs) : "TIMED OUT"}`);
console.log(`   cost on the wire               ${editBytes} bytes  ${editBytes < 400 ? "(proportional to the edit)" : "(NOT proportional — check the diff in applyElementsToDoc)"}\n`);

// 4. Everyone present, moving ------------------------------------------------------

const others = Array.from({ length: Math.max(0, PEERS - 2) }, () => connect(ROOM));
const all = [author, joiner, ...others];
await until(() => all.every((p) => p.provider.wsconnected), 30_000);
await until(() => all.every((p) => getElementsMap(p.doc).size === ELEMENTS), 60_000);
await wait(500);

resetCounters();
const cursorStart = Date.now();
const interval = 1000 / CURSOR_HZ;
let frames = 0;
while (Date.now() - cursorStart < CURSOR_SECONDS * 1000) {
    const t = (Date.now() - cursorStart) / 1000;
    all.forEach((p, i) => {
        p.provider.awareness.setLocalStateField("presence", {
            name: `Peer ${i}`,
            color: "#1971c2",
            cursor: { x: Math.round(Math.cos(t + i) * 500), y: Math.round(Math.sin(t + i) * 500) },
            selection: [],
            tool: "selection",
            draft: null,
        });
    });
    frames++;
    await wait(interval);
}
await wait(300);
const presence = totals();
const seconds = (Date.now() - cursorStart) / 1000;

console.log(`4. ${all.length} peers moving their cursors`);
console.log(`   published                      ${frames} updates each`);
console.log(`   sent, all peers                ${kb(presence.sent)}  (${kb(presence.sent / seconds)}/s)`);
console.log(`   received, all peers            ${kb(presence.received)}  (${kb(presence.received / seconds)}/s)`);
console.log(`   per peer, received             ${kb(presence.received / all.length / seconds)}/s\n`);

// 5. Streaming an in-flight stroke ---------------------------------------------------

/**
 * The whole in-flight element goes out on every frame of a gesture, so this is
 * the one presence payload that grows while it is being sent. `raw` publishes
 * the points as recorded; `thinned` runs them through the same `draftGeometry`
 * the binding uses, which is what the app actually does.
 */
const streamStroke = async (thinned: boolean) => {
    resetCounters();
    const start = Date.now();
    const stroke: Point[] = [];
    let points = 0;
    for (let i = 0; i < 300; i++) {
        stroke.push({ x: 100 + i, y: 200 + Math.round(Math.sin(i / 20) * 50) });
        const element = { ...elements[0], id: "in-flight", type: "pencil", points: [...stroke] } as Element;
        const draft = thinned ? draftGeometry([element], 1) : [element];
        points += draft[0].points!.length;
        author.provider.awareness.setLocalStateField("presence", {
            name: "Peer 0", color: "#1971c2", cursor: { x: 100 + i, y: 200 },
            selection: [], tool: "pencil", draft,
        });
        await wait(16); // the binding coalesces to roughly one frame
    }
    await wait(200);
    const t = (Date.now() - start) / 1000;
    // The author's own socket, not the room total: this measures what one
    // person drawing costs to upload.
    const sent = authorSocket.counters.sent;
    console.log(`   ${(thinned ? "thinned (what the app sends)" : "as recorded").padEnd(30)} ${kb(sent).padStart(9)} sent  ${kb(sent / t).padStart(9)}/s   ${points} points published`);
    return sent;
};

console.log("5. One peer drawing a 300-point stroke, streamed as a draft");
const rawBytes = await streamStroke(false);
const thinBytes = await streamStroke(true);
console.log(`   ${"saving".padEnd(30)} ${(100 - (thinBytes / rawBytes) * 100).toFixed(0)}%\n`);

// --- Done ---------------------------------------------------------------------------

if (HOLD > 0) {
    console.log(`Holding the room open for ${HOLD}s — open ${url.replace(/^ws/, "http").replace(/:\d+$/, ":3000")}/r/${ROOM} to measure frame time.`);
    await wait(HOLD * 1000);
}

all.forEach((p) => p.provider.destroy());
await wait(200);
await relay?.close();
process.exit(0);
