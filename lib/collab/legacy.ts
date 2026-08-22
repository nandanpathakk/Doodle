import type { Element } from "../types.ts";
import { normalizeIndices } from "../order.ts";

/**
 * Before elements moved into a Yjs document they were persisted by the store's
 * localStorage middleware. Those drawings are imported once, so upgrading does
 * not look like losing your work.
 */

const LEGACY_KEY = "doodle-storage";
const IMPORTED_FLAG = "doodle-elements-imported";

/**
 * Read the pre-Yjs drawing, if there is one still to import.
 *
 * Call this before anything can write to localStorage: the store no longer
 * persists elements, so the next write of its remaining keys drops them.
 */
export const readLegacyElements = (): Element[] => {
    if (typeof localStorage === "undefined") return [];
    // The flag, not emptiness, decides. Clearing the canvas eventually garbage
    // collects every tombstone, and without this that would re-import the old
    // drawing and resurrect what the user deleted.
    if (localStorage.getItem(IMPORTED_FLAG)) return [];

    try {
        const raw = localStorage.getItem(LEGACY_KEY);
        if (!raw) return [];
        const elements = JSON.parse(raw)?.state?.elements;
        if (!Array.isArray(elements) || elements.length === 0) return [];

        const now = Date.now();
        return normalizeIndices(
            elements.map((el: Element) => (el.updatedAt ? el : { ...el, updatedAt: now }))
        );
    } catch {
        return []; // unreadable legacy data is not worth failing startup over
    }
};

export const markLegacyImported = (): void => {
    try {
        localStorage.setItem(IMPORTED_FLAG, "1");
    } catch {
        // Private browsing can refuse writes; re-importing later is survivable.
    }
};
