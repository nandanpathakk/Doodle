import { nanoid } from "nanoid";
import { Element } from "./types";

// In-app clipboard. Kept in module scope so it survives re-renders but not reloads.
let clipboard: Element[] = [];

export const setClipboard = (elements: Element[]) => {
    // Deep clone so later edits to the originals don't mutate the clipboard.
    clipboard = elements.map((el) => ({
        ...el,
        points: el.points ? el.points.map((p) => ({ ...p })) : undefined,
    }));
};

export const hasClipboard = () => clipboard.length > 0;

/**
 * Produce fresh copies of the given elements with new ids, offset by (dx, dy).
 * Group relationships are preserved by remapping each old groupId to a new one.
 */
export const cloneElements = (
    elements: Element[],
    dx: number,
    dy: number
): Element[] => {
    const groupIdMap = new Map<string, string>();

    return elements.map((el) => {
        let groupId = el.groupId;
        if (groupId) {
            if (!groupIdMap.has(groupId)) groupIdMap.set(groupId, nanoid());
            groupId = groupIdMap.get(groupId);
        }
        return {
            ...el,
            id: nanoid(),
            x: el.x + dx,
            y: el.y + dy,
            points: el.points ? el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) : undefined,
            groupId,
            // A copy is a new element: never inherit the source's tombstone.
            isDeleted: false,
            updatedAt: Date.now(),
            version: 1,
        };
    });
};

export const pasteFromClipboard = (dx: number, dy: number): Element[] =>
    cloneElements(clipboard, dx, dy);
