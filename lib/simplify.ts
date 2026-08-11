import type { Element, Point } from "./types.ts";

/**
 * Ramer–Douglas–Peucker, for pencil strokes.
 *
 * A hand-drawn stroke arrives at pointer-event rate and commits several hundred
 * points where a few dozen look identical. Every one of them is then stored in
 * the document, sent to every peer, persisted to IndexedDB, and walked on every
 * repaint — so the cost of a drawing grows with how it was drawn rather than
 * with what is in it. This is the one part of the system that degrades with use.
 *
 * Applied at commit, never during the gesture: the person drawing should see
 * every point they made.
 */

/**
 * Perpendicular distance from `p` to the infinite line through `a` and `b`.
 *
 * The line rather than the segment, which is the classical formulation — the
 * candidate always lies between the two ends, so the two agree where it
 * matters, and the line form has no branches.
 */
const lineDistance = (p: Point, a: Point, b: Point): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // Coincident ends: a closed stroke returning to where it started. Fall back
    // to distance from the point itself, so the split still finds the far side
    // of the loop instead of discarding all of it.
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / Math.hypot(dx, dy);
};

/**
 * Drop points that lie within `tolerance` of the line their neighbours already
 * describe. Endpoints are always kept, and the result is a subset of the input
 * in its original order — no point is moved or invented.
 *
 * `tolerance` is in the same units as the points, so a caller working in world
 * coordinates should divide by the zoom to think in screen pixels.
 */
export const simplifyPoints = (points: Point[], tolerance: number): Point[] => {
    if (points.length <= 2 || !(tolerance > 0)) return points;

    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;

    // Explicit stack rather than recursion: a stroke that never doubles back
    // splits one point at a time, which is depth O(n) on the call stack.
    const stack: [number, number][] = [[0, points.length - 1]];
    while (stack.length > 0) {
        const [first, last] = stack.pop()!;
        let furthest = -1;
        let maxDistance = tolerance;

        for (let i = first + 1; i < last; i++) {
            const distance = lineDistance(points[i], points[first], points[last]);
            if (distance > maxDistance) {
                maxDistance = distance;
                furthest = i;
            }
        }

        if (furthest === -1) continue; // everything between is within tolerance
        keep[furthest] = 1;
        stack.push([first, furthest], [furthest, last]);
    }

    const result: Point[] = [];
    for (let i = 0; i < points.length; i++) if (keep[i] === 1) result.push(points[i]);
    return result;
};

/**
 * How far a committed stroke may drift from what was drawn, in screen pixels.
 *
 * One pixel, because that is the resolution of the input: pointer events report
 * whole CSS pixels, so the recorded stroke already sits on a 1px lattice and
 * carries up to half a pixel of quantization error before anything here runs.
 * Simplifying to a finer tolerance than that mostly preserves the lattice noise
 * rather than the shape — measured on a 301-point stroke, 0.5px kept 101 points
 * where 1px keeps 31, for no visible difference.
 */
export const STROKE_TOLERANCE_PX = 1;

/**
 * The tolerance is in screen pixels, so it must be divided by the zoom to be
 * applied to world coordinates — a stroke drawn at 400% deserves a proportion-
 * ately finer one, since its author could see that detail.
 *
 * Capped, though, because the same reasoning runs out at the other end: drawn
 * at 10% zoom, one screen pixel is ten world units, and zooming in afterwards
 * would show a stroke visibly coarser than the one that was drawn.
 */
const MAX_TOLERANCE_WORLD = 2;

export const strokeTolerance = (zoom: number): number =>
    Math.min(STROKE_TOLERANCE_PX / zoom, MAX_TOLERANCE_WORLD);

/**
 * The version of an in-flight gesture that goes out over awareness.
 *
 * A draft is republished in full on every frame of the gesture, so an
 * unsimplified stroke costs the square of its own length: at 300 points that
 * measured 5.4 MB over the wire for a single stroke, most of it points the
 * previous frame had already sent. Thinning each frame to the same tolerance
 * the commit will use bounds the payload by the shape rather than by how long
 * the gesture has been going on.
 *
 * Using the *same* tolerance as the commit rather than a coarser one is
 * deliberate: what peers watch being drawn is then exactly what they end up
 * with, so the handoff from draft to committed element has nothing to snap to.
 */
export const draftGeometry = (elements: Element[], zoom: number): Element[] => {
    const tolerance = strokeTolerance(zoom);
    return elements.map((element) =>
        element.points && element.points.length > 2
            ? { ...element, points: simplifyPoints(element.points, tolerance) }
            : element
    );
};
