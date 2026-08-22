/**
 * Keeping the relay host awake while someone has the app open.
 *
 * **This has nothing to do with collaboration.** It is deployment plumbing: a
 * free host suspends a service that has been idle for a while, and waking one
 * takes the better part of a minute. If that wait happens when somebody presses
 * Share, they watch a spinner; if it happens when they open the page, it is
 * over before they need it.
 *
 * So: one request the moment the app loads, then one every few minutes for as
 * long as the page is open. It stops when they leave.
 *
 * It is deliberately kept out of `lib/collab/` and shares nothing with it — no
 * store, no WebSocket, no awareness, no connection state. It sends a plain HTTP
 * GET to a health endpoint that does not touch a room, and it ignores whatever
 * comes back. If the relay is down, or the fetch fails, or the endpoint does
 * not exist, nothing happens: sessions connect, sync, and recover exactly as
 * they would if this file were deleted.
 *
 * Two things to be careful of if you change it:
 *
 * - **Never let it fail loudly.** A rejected fetch here must not surface as an
 *   error state, because it says nothing about whether collaboration works.
 * - **Never let it write to the store.** The connection indicator reports the
 *   WebSocket, which is a different thing from whether this ping succeeded.
 */

import { relayUrl } from "./collab/session.ts";

/**
 * Comfortably inside the ~15 minutes a free host waits before suspending an
 * idle service, with room to spare for a browser throttling timers in a
 * background tab.
 */
const PING_INTERVAL_MS = 4 * 60 * 1000;

/**
 * The relay speaks WebSocket, but it is an HTTP server underneath.
 *
 * Exported for the tests: get this mapping wrong and nothing warms up, silently
 * — the ping would fail forever and the only symptom would be the cold start it
 * was added to prevent.
 */
export const healthUrl = (): string | null => {
    const url = relayUrl();
    if (url.startsWith("wss://")) return `https://${url.slice(6)}/healthz`;
    if (url.startsWith("ws://")) return `http://${url.slice(5)}/healthz`;
    return null; // not a relay URL we recognise; do nothing rather than guess
};

/**
 * Start pinging, and return a function that stops.
 *
 * Errors are swallowed on purpose — see the note above. The health endpoint
 * sends a permissive CORS header so this is an ordinary cross-origin request
 * rather than an opaque `no-cors` one; that only matters for keeping the
 * network panel honest, since either kind reaches the host.
 */
export function startWarmingRelay(): () => void {
    const url = healthUrl();
    if (!url || typeof fetch !== "function") return () => {};

    let stopped = false;

    const ping = () => {
        if (stopped) return;
        // Cache-busted, or a proxy could answer from cache and the host would
        // never hear from us at all.
        void fetch(`${url}?t=${Date.now()}`, { cache: "no-store" })
            .catch(() => {
                // Deliberately empty. Whether the host is awake is not
                // something the person drawing needs to be told about.
            });
    };

    ping();
    const timer = setInterval(ping, PING_INTERVAL_MS);

    // Coming back to a tab that has been in the background is exactly when the
    // host is most likely to have gone to sleep and the person most likely to
    // be about to do something. Timers are throttled while hidden, so this is
    // not covered by the interval above.
    const onVisible = () => {
        if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisible);
    };
}
