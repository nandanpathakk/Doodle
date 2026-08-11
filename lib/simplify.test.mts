import { simplifyPoints, strokeTolerance, draftGeometry, STROKE_TOLERANCE_PX } from "./simplify.ts";
import type { Element, Point } from "./types.ts";

/**
 * Tests for stroke simplification.
 *
 * The two properties that matter are that the stroke still looks like itself —
 * no original point ends up further than the tolerance from the simplified
 * polyline — and that it actually saves something. A version that returned the
 * input unchanged would pass any test that only checked fidelity.
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

/** Distance to a segment, which is what "how far off is this" actually means. */
const segmentDistance = (p: Point, a: Point, b: Point): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** The worst any original point is off the simplified polyline. */
const maxDeviation = (original: Point[], simplified: Point[]): number => {
    let worst = 0;
    for (const p of original) {
        let nearest = Infinity;
        for (let i = 0; i < simplified.length - 1; i++) {
            nearest = Math.min(nearest, segmentDistance(p, simplified[i], simplified[i + 1]));
        }
        worst = Math.max(worst, nearest);
    }
    return worst;
};

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/**
 * A stroke shaped like one a hand makes: a long arc, sampled far more densely
 * than it needs to be, with a little jitter on top.
 */
const handStroke = (count: number): Point[] => {
    const points: Point[] = [];
    let seed = 12345;
    const noise = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return (seed / 2147483648 - 0.5) * 0.4; // ±0.2px, below the tolerance
    };
    for (let i = 0; i < count; i++) {
        const t = (i / (count - 1)) * Math.PI;
        // Rounded, because that is what the app records: pointer events report
        // whole CSS pixels, so a real stroke arrives already on a 1px lattice.
        points.push({
            x: Math.round(100 + t * 120 + noise()),
            y: Math.round(200 + Math.sin(t) * 90 + noise()),
        });
    }
    return points;
};

console.log("\n# fidelity");
{
    const original = handStroke(400);
    const simplified = simplifyPoints(original, STROKE_TOLERANCE_PX);

    check("endpoints are preserved exactly",
        same(simplified[0], original[0]) &&
        same(simplified[simplified.length - 1], original[original.length - 1]));

    const deviation = maxDeviation(original, simplified);
    check("no point drifts further than the tolerance",
        deviation <= STROKE_TOLERANCE_PX + 1e-9, `worst ${deviation.toFixed(4)}px`);

    const originalIds = new Set(original.map((p) => `${p.x},${p.y}`));
    check("every kept point is one of the originals, not an interpolation",
        simplified.every((p) => originalIds.has(`${p.x},${p.y}`)));

    let ordered = true;
    let cursor = 0;
    for (const p of simplified) {
        while (cursor < original.length && !same(original[cursor], p)) cursor++;
        if (cursor === original.length) { ordered = false; break; }
    }
    check("order is preserved", ordered);
}

console.log("\n# saving");
{
    const original = handStroke(400);
    const simplified = simplifyPoints(original, STROKE_TOLERANCE_PX);
    check("a 400-point stroke loses most of its points",
        simplified.length < 80, `kept ${simplified.length}`);
    console.log(`        400 → ${simplified.length} points`);
}

{
    const straight: Point[] = [];
    for (let i = 0; i < 100; i++) straight.push({ x: i * 3, y: 50 });
    const simplified = simplifyPoints(straight, STROKE_TOLERANCE_PX);
    check("a straight run collapses to its two ends",
        simplified.length === 2, `kept ${simplified.length}`);
}

{
    // A deliberate corner is not a rounding error and must survive.
    const corner: Point[] = [];
    for (let i = 0; i <= 50; i++) corner.push({ x: i * 2, y: 0 });
    for (let i = 1; i <= 50; i++) corner.push({ x: 100, y: i * 2 });
    const simplified = simplifyPoints(corner, STROKE_TOLERANCE_PX);
    check("a sharp corner is kept", simplified.some((p) => p.x === 100 && p.y === 0),
        `kept ${JSON.stringify(simplified)}`);
    check("and nothing else is", simplified.length === 3, `kept ${simplified.length}`);
}

console.log("\n# tolerance for a zoom");
{
    check("at 100% it is the screen tolerance", strokeTolerance(1) === STROKE_TOLERANCE_PX);
    check("zoomed in it is finer, so detail the author could see survives",
        strokeTolerance(4) === STROKE_TOLERANCE_PX / 4);
    check("zoomed out it is capped rather than scaling without limit",
        strokeTolerance(0.05) === 2, `got ${strokeTolerance(0.05)}`);
    check("the cap only ever binds below 100%", strokeTolerance(1) < 2);
}

console.log("\n# drafts published mid-gesture");
{
    const el = (over: Partial<Element>): Element => ({
        id: "e", type: "pencil", x: 0, y: 0, width: 10, height: 10,
        strokeColor: "#000", backgroundColor: "transparent", strokeWidth: 1,
        roughness: 1, opacity: 100, seed: 1, index: "a0", updatedAt: 1, version: 1,
        ...over,
    });

    const stroke = el({ points: handStroke(300) });
    const [thinned] = draftGeometry([stroke], 1);
    check("a stroke is thinned before it goes out",
        thinned.points!.length < 60, `kept ${thinned.points!.length}`);
    check("but the element it came from is left alone — the store keeps every point",
        stroke.points!.length === 300);
    check("and nothing else about the element changes",
        thinned.id === stroke.id && thinned.seed === stroke.seed && thinned.x === stroke.x);

    const rect = el({ type: "rectangle", points: undefined });
    check("an element with no points passes straight through",
        draftGeometry([rect], 1)[0] === rect);

    const line = el({ type: "line", points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] });
    check("a two-point line is untouched — there is nothing to drop",
        draftGeometry([line], 1)[0].points!.length === 2);

    check("zoom is respected, so a magnified gesture streams more detail",
        draftGeometry([stroke], 8)[0].points!.length > thinned.points!.length);
}

console.log("\n# degenerate input");
{
    const two: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    check("two points are returned untouched", simplifyPoints(two, 5) === two);
    check("one point is returned untouched", simplifyPoints([two[0]], 5).length === 1);
    check("no points is returned untouched", simplifyPoints([], 5).length === 0);

    const many = handStroke(20);
    check("a zero tolerance changes nothing", simplifyPoints(many, 0) === many);
    check("a negative tolerance changes nothing", simplifyPoints(many, -1) === many);
}

{
    // A closed loop: both ends coincide, so the line through them degenerates.
    const loop: Point[] = [];
    for (let i = 0; i <= 60; i++) {
        const t = (i / 60) * Math.PI * 2;
        loop.push({ x: Math.round(Math.cos(t) * 50 * 1e6) / 1e6, y: Math.round(Math.sin(t) * 50 * 1e6) / 1e6 });
    }
    loop[loop.length - 1] = { ...loop[0] };
    const simplified = simplifyPoints(loop, STROKE_TOLERANCE_PX);
    check("a closed loop keeps its shape rather than collapsing",
        simplified.length > 8, `kept ${simplified.length}`);
    check("and stays within tolerance",
        maxDeviation(loop, simplified) <= STROKE_TOLERANCE_PX + 1e-9);
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"}  ${assertions - failures}/${assertions}`);
if (failures > 0) process.exit(1);
