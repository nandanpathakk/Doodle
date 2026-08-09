import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import type { Element } from "./types";

/**
 * Z-order lives in `Element.index`, a fractional index: a string key that can
 * always have a new key generated between any two neighbours without touching
 * them. Reordering therefore rewrites only the elements that actually moved,
 * where an array splice rewrites every position after the move.
 *
 * Store invariant: `elements` is kept sorted ascending by `index`, so array
 * position mirrors z-order. The renderer and hit-testing keep reading array
 * order directly and never pay for a per-frame sort.
 */

/**
 * Two clients can independently generate the same key for concurrent inserts;
 * `id` breaks the tie so every peer settles on the same order.
 */
export const compareIndex = (a: Element, b: Element): number => {
    if (a.index !== b.index) return a.index < b.index ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

export const sortByIndex = (elements: Element[]): Element[] =>
    [...elements].sort(compareIndex);

const topIndex = (elements: Element[]): string | null => {
    let top: string | null = null;
    for (const el of elements) {
        if (el.index && (top === null || el.index > top)) top = el.index;
    }
    return top;
};

/** Key placing a new element above everything currently present. */
export const indexOnTop = (elements: Element[]): string =>
    generateKeyBetween(topIndex(elements), null);

/**
 * Give `incoming` fresh keys stacked above `existing` and return the combined,
 * sorted list. Used by paste / duplicate / alt-drag, where clones would
 * otherwise inherit their source's index and collide with it.
 */
export const appendOnTop = (existing: Element[], incoming: Element[]): Element[] => {
    if (incoming.length === 0) return existing;
    const keys = generateNKeysBetween(topIndex(existing), null, incoming.length);
    return [...existing, ...incoming.map((el, i) => ({ ...el, index: keys[i] }))];
};

/**
 * Ensure every element carries a unique index, preserving the given array order
 * when keys have to be rebuilt. Applied to anything entering the store from
 * outside — persisted state, opened files — since data written before z-order
 * became a field has no index at all.
 */
export const normalizeIndices = (elements: Element[]): Element[] => {
    const seen = new Set<string>();
    const needsRebuild = elements.some((el) => {
        if (!el.index || seen.has(el.index)) return true;
        seen.add(el.index);
        return false;
    });
    if (!needsRebuild) return sortByIndex(elements);

    const keys = generateNKeysBetween(null, null, elements.length);
    return elements.map((el, i) => ({ ...el, index: keys[i] }));
};

/**
 * Realise a target array order by re-keying only the elements that moved.
 * Unmoved elements keep their keys, and because they hold their original
 * relative order those keys are still ascending — so each run of moved
 * elements can be slotted between the unmoved neighbours that bracket it.
 */
export const reindexToOrder = (target: Element[], movedIds: Set<string>): Element[] => {
    const result = [...target];
    let i = 0;

    while (i < result.length) {
        if (!movedIds.has(result[i].id)) {
            i++;
            continue;
        }

        // Extent of this contiguous run of moved elements.
        let j = i;
        while (j < result.length && movedIds.has(result[j].id)) j++;

        const before = i > 0 ? result[i - 1].index : null;
        const after = j < result.length ? result[j].index : null;
        const keys = generateNKeysBetween(before, after, j - i);
        for (let k = i; k < j; k++) result[k] = { ...result[k], index: keys[k - i] };

        i = j;
    }

    return result;
};
