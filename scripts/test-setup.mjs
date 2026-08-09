import { register } from "node:module";

/**
 * Test bootstrap: resolves the "@/" alias, and provides the browser globals the
 * store touches on import (its persistence middleware reads localStorage during
 * rehydration). Loaded with `node --import`, so this runs before any test
 * module is evaluated.
 */

register("./alias-hooks.mjs", import.meta.url);

if (typeof globalThis.localStorage === "undefined") {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => void store.set(k, String(v)),
        removeItem: (k) => void store.delete(k),
        clear: () => store.clear(),
        key: (i) => [...store.keys()][i] ?? null,
        get length() { return store.size; },
    };
}
