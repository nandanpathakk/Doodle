import * as Y from "yjs";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import { startRelay } from "./relay.ts";
import { LOCAL_ORIGIN, getElementsMap, applyElementsToDoc, docToElements } from "../lib/collab/doc.ts";
import type { Element } from "../lib/types.ts";

/**
 * End-to-end tests for the relay: two peers, a real WebSocket between them.
 *
 * These exercise the parts that unit tests over a single document cannot —
 * that a late joiner is caught up from the server rather than waiting for
 * someone to make an edit, that presence is withdrawn when a peer drops rather
 * than leaving a ghost cursor, and that rooms really are ephemeral.
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll until a condition holds, so tests are not hostage to a fixed sleep. */
const until = async (predicate: () => boolean, timeoutMs = 4000): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return true;
        await wait(25);
    }
    return predicate();
};

const relay = await startRelay({ port: 0, host: "127.0.0.1" });
const url = `ws://127.0.0.1:${relay.port}`;

const connect = (room: string) => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(url, room, doc, {
        WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    return { doc, provider };
};

const write = (doc: Y.Doc, elements: Element[]) =>
    doc.transact(() => applyElementsToDoc(getElementsMap(doc), elements), LOCAL_ORIGIN);

const ids = (doc: Y.Doc) => docToElements(getElementsMap(doc)).map((e) => e.id).join(",");

console.log("\n# two peers in a room converge");
{
    const a = connect("room-1");
    const b = connect("room-1");

    check("peer A connects", await until(() => a.provider.wsconnected));
    check("peer B connects", await until(() => b.provider.wsconnected));

    write(a.doc, [el("from-a", "a0")]);
    check("B receives A's element", await until(() => ids(b.doc) === "from-a"), `-> ${ids(b.doc)}`);

    write(b.doc, [el("from-a", "a0"), el("from-b", "a1")]);
    check("A receives B's element", await until(() => ids(a.doc) === "from-a,from-b"), `-> ${ids(a.doc)}`);

    // Concurrent edits to different fields of the same element.
    a.doc.transact(() => getElementsMap(a.doc).get("from-a")!.set("x", 100), LOCAL_ORIGIN);
    b.doc.transact(() => getElementsMap(b.doc).get("from-a")!.set("strokeColor", "#f00"), LOCAL_ORIGIN);

    await until(() =>
        docToElements(getElementsMap(a.doc))[0].x === 100 &&
        docToElements(getElementsMap(a.doc))[0].strokeColor === "#f00"
    );
    const fromA = docToElements(getElementsMap(a.doc))[0];
    const fromB = docToElements(getElementsMap(b.doc))[0];
    check("both field edits survive", fromA.x === 100 && fromA.strokeColor === "#f00", `-> ${JSON.stringify(fromA)}`);
    check("peers agree", JSON.stringify(fromA) === JSON.stringify(fromB));

    a.provider.destroy();
    b.provider.destroy();
    await wait(150);
}

console.log("\n# a late joiner is caught up by the server");
{
    const a = connect("room-2");
    await until(() => a.provider.wsconnected);
    write(a.doc, [el("early", "a0"), el("also-early", "a1")]);
    await wait(200);

    // C joins after the fact and must be caught up without anyone editing again.
    const c = connect("room-2");
    check("late joiner receives existing content",
        await until(() => ids(c.doc) === "early,also-early"), `-> ${ids(c.doc)}`);

    a.provider.destroy();
    c.provider.destroy();
    await wait(150);
}

console.log("\n# presence propagates and is withdrawn on disconnect");
{
    const a = connect("room-3");
    const b = connect("room-3");
    await until(() => a.provider.wsconnected && b.provider.wsconnected);

    a.provider.awareness.setLocalStateField("user", { name: "Ada" });
    check("B sees A's presence", await until(() => {
        const states = [...b.provider.awareness.getStates().values()];
        return states.some((s) => (s as { user?: { name: string } }).user?.name === "Ada");
    }));

    // A drops without cleaning up gracefully.
    a.provider.disconnect();
    check("A's presence is withdrawn, not left as a ghost", await until(() => {
        const states = [...b.provider.awareness.getStates().values()];
        return !states.some((s) => (s as { user?: { name: string } }).user?.name === "Ada");
    }), "ghost cursor remained");

    a.provider.destroy();
    b.provider.destroy();
    await wait(150);
}

console.log("\n# rooms are ephemeral");
{
    const before = relay.roomCount();
    const a = connect("room-4");
    await until(() => a.provider.wsconnected);
    write(a.doc, [el("temp", "a0")]);
    await wait(150);
    check("room is open while someone is connected", relay.roomCount() > before);

    a.provider.destroy();
    check("room is dropped when the last peer leaves",
        await until(() => relay.roomCount() === before), `-> ${relay.roomCount()} rooms`);
}

console.log("\n# the health endpoint");
{
    // A host that gets anything other than 200 here decides the service is
    // unhealthy and restarts it, over and over. Left to itself `ws` answers
    // plain HTTP with 426, so this endpoint is what makes the thing deployable.
    const httpUrl = `http://127.0.0.1:${relay.port}`;

    const health = await fetch(`${httpUrl}/healthz`);
    check("responds 200", health.status === 200, `-> ${health.status}`);
    const body = await health.json();
    check("reports ok", body.status === "ok", `-> ${JSON.stringify(body)}`);
    check("reports a room count, not room contents",
        typeof body.rooms === "number" && !("names" in body), `-> ${JSON.stringify(body)}`);
    check("is reachable from a browser on another origin",
        health.headers.get("access-control-allow-origin") === "*");

    const root = await fetch(httpUrl);
    check("the root answers too, so a bare URL is a valid ping", root.status === 200);

    const missing = await fetch(`${httpUrl}/nope`);
    check("anything else is a 404", missing.status === 404, `-> ${missing.status}`);

    // The point of the endpoint is that it does not disturb anything.
    const before = relay.roomCount();
    await fetch(`${httpUrl}/healthz`);
    check("pinging opens no rooms", relay.roomCount() === before);
}

console.log("\n# a health check does not disturb a live session");
{
    const a = connect("room-5");
    const b = connect("room-5");
    await until(() => a.provider.wsconnected && b.provider.wsconnected);
    write(a.doc, [el("before-ping", "a0")]);
    await until(() => ids(b.doc) === "before-ping");

    // Whatever keeps the host awake must be invisible to the people drawing.
    for (let i = 0; i < 5; i++) await fetch(`http://127.0.0.1:${relay.port}/healthz`);

    check("peers stay connected", a.provider.wsconnected && b.provider.wsconnected);
    write(a.doc, [el("before-ping", "a0"), el("after-ping", "a1")]);
    check("edits still flow",
        await until(() => ids(b.doc) === "before-ping,after-ping"), `-> ${ids(b.doc)}`);

    a.provider.destroy();
    b.provider.destroy();
    await wait(150);
}

console.log("\n# rooms are isolated from one another");
{
    const a = connect("alpha");
    const b = connect("beta");
    await until(() => a.provider.wsconnected && b.provider.wsconnected);

    write(a.doc, [el("secret", "a0")]);
    await wait(300);
    check("an element does not leak between rooms", ids(b.doc) === "", `-> ${ids(b.doc)}`);

    a.provider.destroy();
    b.provider.destroy();
    await wait(150);
}

await relay.close();

console.log(
    failures === 0
        ? `\n${assertions} assertions, all passed\n`
        : `\n${failures} of ${assertions} assertions FAILED\n`
);
process.exit(failures ? 1 : 0);
