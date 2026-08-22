import { startFollowSync } from "./follow.ts";
import { useStore } from "@/store/useStore";
import type { Awareness } from "y-protocols/awareness";
import {
    startPresence, publishViewport, getRemotePeers, type Peer,
} from "./presence.ts";

/**
 * Tests for following a peer's viewport.
 *
 * The property worth pinning is the negative one: applying a followed viewport
 * moves our canvas, which is indistinguishable from the user panning unless
 * something says otherwise — and the user panning is what *stops* following. Get
 * that wrong and following switches itself off on the first frame it works.
 *
 * Presence is driven directly here rather than through a relay: this is about
 * the rule, not the transport, and `server/relay.test.mts` already covers the
 * wire.
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

/** Presence coalesces publishes to one per frame's worth of time. */
const flushPublish = () => new Promise((r) => setTimeout(r, 40));

const store = () => useStore.getState();
const viewport = () => {
    const { scrollX, scrollY, zoom } = store().appState;
    return `${scrollX},${scrollY},${zoom}`;
};

/**
 * Just enough of the awareness interface for presence to attach to. The real
 * one is exercised end to end in the relay tests.
 */
const fakeAwareness = (clientID: number) => {
    const listeners = new Set<() => void>();
    const states = new Map<number, unknown>();
    return {
        clientID,
        getStates: () => states,
        setLocalStateField: (_k: string, v: unknown) => {
            states.set(clientID, { presence: v });
            listeners.forEach((fn) => fn());
        },
        on: (_e: string, fn: () => void) => { listeners.add(fn); },
        off: (_e: string, fn: () => void) => { listeners.delete(fn); },
        /** A peer's state arriving from the network. */
        inject: (id: number, presence: Partial<Peer>) => {
            states.set(id, { presence });
            listeners.forEach((fn) => fn());
        },
    };
};

const peer = (over: Partial<Peer> = {}): Partial<Peer> => ({
    name: "Ada", color: "#e03131", cursor: null, selection: [],
    tool: "selection", viewport: null, following: null, draft: null, ...over,
});

const setup = (clientID = 1) => {
    store().setViewport({ scrollX: 0, scrollY: 0, zoom: 1 });
    store().setFollowing(null);
    const awareness = fakeAwareness(clientID);
    const stopPresence = startPresence(awareness as unknown as Awareness);
    const stopFollow = startFollowSync();
    return { awareness, dispose: () => { stopFollow(); stopPresence(); } };
};

console.log("\n# our viewport is published");
{
    const { awareness, dispose } = setup();
    store().setScroll(120, 40);
    // Publishing is coalesced to roughly one frame, so give it that long.
    await flushPublish();
    const mine = (awareness.getStates().get(1) as { presence: Peer }).presence;
    check("panning updates what we publish",
        mine.viewport?.scrollX === 120 && mine.viewport?.scrollY === 40,
        `-> ${JSON.stringify(mine.viewport)}`);
    dispose();
}

console.log("\n# following moves our canvas");
{
    const { awareness, dispose } = setup();
    awareness.inject(2, peer({ viewport: { scrollX: 300, scrollY: 150, zoom: 2 } }));
    check("a peer's viewport alone does nothing", viewport() === "0,0,1", `-> ${viewport()}`);

    store().setFollowing(2);
    awareness.inject(2, peer({ viewport: { scrollX: 300, scrollY: 150, zoom: 2 } }));
    check("following adopts it", viewport() === "300,150,2", `-> ${viewport()}`);

    awareness.inject(2, peer({ viewport: { scrollX: 310, scrollY: 150, zoom: 2 } }));
    check("and keeps up as they move", viewport() === "310,150,2", `-> ${viewport()}`);
    dispose();
}

console.log("\n# following survives the move it causes");
{
    // The regression this whole design is shaped around: adopting the peer's
    // viewport is a viewport change, and a viewport change is what unfollows.
    const { awareness, dispose } = setup();
    store().setFollowing(2);
    awareness.inject(2, peer({ viewport: { scrollX: 500, scrollY: 500, zoom: 1 } }));
    check("still following after adopting their viewport",
        store().followingClientId === 2, `-> ${store().followingClientId}`);
    check("and after several more of their moves", (() => {
        for (let i = 0; i < 5; i++) {
            awareness.inject(2, peer({ viewport: { scrollX: 500 + i, scrollY: 500, zoom: 1 } }));
        }
        return store().followingClientId === 2;
    })());
    dispose();
}

console.log("\n# moving the canvas yourself stops it");
{
    const { awareness, dispose } = setup();
    store().setFollowing(2);
    awareness.inject(2, peer({ viewport: { scrollX: 200, scrollY: 0, zoom: 1 } }));
    check("following", store().followingClientId === 2);

    store().setScroll(0, 0);
    check("panning stops following", store().followingClientId === null);

    awareness.inject(2, peer({ viewport: { scrollX: 900, scrollY: 900, zoom: 3 } }));
    check("and their later moves are ignored", viewport() === "0,0,1", `-> ${viewport()}`);
    dispose();
}

{
    const { awareness, dispose } = setup();
    store().setFollowing(2);
    awareness.inject(2, peer({ viewport: { scrollX: 200, scrollY: 0, zoom: 1 } }));
    store().setZoom(2);
    check("zooming stops following too", store().followingClientId === null);
    dispose();
}

console.log("\n# a peer who goes quiet");
{
    // Awareness drops anyone unheard from for 30 seconds, which a backgrounded
    // tab manages easily once the browser throttles its timers. Treating that
    // as "they left" made following switch itself off whenever the other person
    // looked away — observed in a real session, not hypothesised.
    const { awareness, dispose } = setup();
    store().setFollowing(2);
    awareness.inject(2, peer({ viewport: { scrollX: 200, scrollY: 100, zoom: 1 } }));
    check("following", store().followingClientId === 2);

    awareness.getStates().delete(2);
    awareness.inject(3, peer({ name: "Bo" })); // somebody else moves; peer 2 is gone
    check("their absence does not cancel following", store().followingClientId === 2);
    check("and we stay where they left us", viewport() === "200,100,1", `-> ${viewport()}`);

    awareness.inject(2, peer({ viewport: { scrollX: 400, scrollY: 250, zoom: 2 } }));
    check("following resumes when they come back", viewport() === "400,250,2", `-> ${viewport()}`);
    dispose();
}

console.log("\n# teardown");
{
    const { awareness, dispose } = setup();
    store().setFollowing(2);
    awareness.inject(2, peer({ viewport: { scrollX: 10, scrollY: 10, zoom: 1 } }));
    dispose();

    check("leaving a session stops following", store().followingClientId === null);
    check("no peers left", getRemotePeers().size === 0);

    // Nothing should still be listening: a viewport change must not throw or
    // reach a torn-down session.
    store().setScroll(999, 999);
    publishViewport(null);
    check("the canvas still moves after teardown", viewport() === "999,999,1", `-> ${viewport()}`);
}

console.log(
    failures === 0
        ? `\n${assertions} assertions, all passed\n`
        : `\n${failures} of ${assertions} assertions FAILED\n`
);
process.exit(failures ? 1 : 0);
