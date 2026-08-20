/**
 * Tests for the relay warm-up ping.
 *
 * Only one thing here can break silently: turning the relay's WebSocket URL
 * into the HTTP URL of its health endpoint. Get it wrong and every ping fails
 * forever, with no symptom except the cold start this exists to avoid.
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

/**
 * `relayUrl()` reads the environment at call time, and `healthUrl()` calls it,
 * so the variable can be set per case. Imported after nothing in particular —
 * neither module holds state.
 */
const withRelayUrl = async (url: string | undefined) => {
    if (url === undefined) delete process.env.NEXT_PUBLIC_COLLAB_URL;
    else process.env.NEXT_PUBLIC_COLLAB_URL = url;
    const { healthUrl } = await import("./warmRelay.ts");
    return healthUrl();
};

console.log("\n# the health endpoint URL");
{
    check("wss becomes https",
        await withRelayUrl("wss://doodle-relay.onrender.com") === "https://doodle-relay.onrender.com/healthz",
        `-> ${await withRelayUrl("wss://doodle-relay.onrender.com")}`);

    check("ws becomes http",
        await withRelayUrl("ws://localhost:1234") === "http://localhost:1234/healthz",
        `-> ${await withRelayUrl("ws://localhost:1234")}`);

    check("a port survives",
        await withRelayUrl("wss://example.com:8443") === "https://example.com:8443/healthz");

    check("a path survives, so a relay behind a prefix still works",
        await withRelayUrl("wss://example.com/relay") === "https://example.com/relay/healthz",
        `-> ${await withRelayUrl("wss://example.com/relay")}`);

    // Never guess. A URL we do not recognise means no ping at all, which costs
    // a cold start; guessing a scheme could mean requests to the wrong host.
    check("an unrecognised scheme pings nothing",
        await withRelayUrl("https://example.com") === null,
        `-> ${await withRelayUrl("https://example.com")}`);

    check("the default local relay still maps",
        await withRelayUrl(undefined) === "http://localhost:1234/healthz",
        `-> ${await withRelayUrl(undefined)}`);
}

console.log(
    failures === 0
        ? `\n${assertions} assertions, all passed\n`
        : `\n${failures} of ${assertions} assertions FAILED\n`
);
process.exit(failures ? 1 : 0);
