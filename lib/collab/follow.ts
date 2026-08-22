import { useStore } from "@/store/useStore";
import {
    getRemotePeers, publishFollowing, publishViewport, subscribeToPeers, type Viewport,
} from "./presence";

/**
 * Following a peer's viewport: your canvas pans and zooms with theirs, so
 * "look at this" does not have to be "scroll left a bit, no, up".
 *
 * Two directions, both here so the rule about which is which stays in one
 * place: our own viewport goes out over presence whenever it changes, and a
 * followed peer's comes back in.
 *
 * The loop to avoid is the same one the store↔document binding has. Applying a
 * followed viewport moves our canvas, which looks exactly like the user panning
 * — and the user panning is what stops following. Without telling the two
 * apart, following would switch itself off on the first frame. The flag below
 * is that distinction, and it is the whole trick.
 *
 * Two people following each other settles rather than oscillating, because
 * nothing is published or applied unless it actually differs.
 */

let applyingFollowed = false;

const viewportOf = ({ scrollX, scrollY, zoom }: {
    scrollX: number; scrollY: number; zoom: number;
}): Viewport => ({ scrollX, scrollY, zoom });

const same = (a: Viewport | null, b: Viewport | null): boolean =>
    a === b || (
        a !== null && b !== null &&
        a.scrollX === b.scrollX && a.scrollY === b.scrollY && a.zoom === b.zoom
    );

/**
 * Wire the two directions up for the life of a session. Returns a teardown that
 * withdraws our viewport and stops following, so leaving a room does not strand
 * the canvas under someone else's control.
 */
export function startFollowSync(): () => void {
    let published = viewportOf(useStore.getState().appState);
    let publishedFollowing = useStore.getState().followingClientId;
    publishViewport(published);
    publishFollowing(publishedFollowing);

    const unsubscribeStore = useStore.subscribe((state) => {
        // Who we follow is published too, so the person being followed can be
        // told. Checked before the viewport, because stopping is often the same
        // store change as the pan that stopped it.
        if (state.followingClientId !== publishedFollowing) {
            publishedFollowing = state.followingClientId;
            publishFollowing(publishedFollowing);
        }

        const next = viewportOf(state.appState);
        if (same(next, published)) return;
        published = next;

        // The user moved the canvas themselves. That is how you stop following
        // — there is no separate "unfollow" gesture to learn.
        if (!applyingFollowed && state.followingClientId !== null) {
            useStore.getState().setFollowing(null);
        }

        publishViewport(next);
    });

    const unsubscribePeers = subscribeToPeers(() => {
        const { followingClientId } = useStore.getState();
        if (followingClientId === null) return;

        // Absent is not the same as gone. Awareness drops a peer that has not
        // been heard from for 30 seconds, which a backgrounded tab manages
        // easily once the browser throttles its timers — and they reappear the
        // moment it is fronted again. Cancelling on absence meant following
        // quietly switched itself off whenever the other person looked away,
        // so absence does nothing and following resumes when they return.
        // Stopping is the user's decision: move the canvas, or say so.
        const peer = getRemotePeers().get(followingClientId);
        if (!peer?.viewport) return;
        if (same(viewportOf(useStore.getState().appState), peer.viewport)) return;

        applyingFollowed = true;
        try {
            useStore.getState().setViewport(peer.viewport);
        } finally {
            applyingFollowed = false;
        }
    });

    return () => {
        unsubscribeStore();
        unsubscribePeers();
        useStore.getState().setFollowing(null);
        publishFollowing(null);
        publishViewport(null);
    };
}
