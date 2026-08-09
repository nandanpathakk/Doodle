import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/**
 * Makes the project's modules resolvable when Node runs them directly, which it
 * does for tests. Node has no knowledge of the bundler's config, so two things
 * need filling in:
 *
 *  - the "@/..." path alias from tsconfig
 *  - extensionless relative imports ("./types"), which bundlers resolve but
 *    Node's ESM resolver does not
 *
 * Lets test files import application modules by the same specifiers the
 * application itself uses, rather than the source being written around the
 * tests.
 */

const root = process.cwd();
const EXTENSIONS = [".ts", ".mts", ".tsx", ".js", ".mjs"];

const firstExisting = (base) => {
    const isFile = (p) => existsSync(p) && statSync(p).isFile();
    if (isFile(base)) return base;
    for (const ext of EXTENSIONS) {
        if (isFile(base + ext)) return base + ext;
    }
    for (const ext of EXTENSIONS) {
        const indexed = path.join(base, `index${ext}`);
        if (isFile(indexed)) return indexed;
    }
    return null;
};

export async function resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
        const hit = firstExisting(path.join(root, specifier.slice(2)));
        if (hit) return next(pathToFileURL(hit).href, context);
    }

    if (specifier.startsWith(".") && !path.extname(specifier)) {
        const parent = context.parentURL
            ? path.dirname(fileURLToPath(context.parentURL))
            : root;
        const hit = firstExisting(path.resolve(parent, specifier));
        if (hit) return next(pathToFileURL(hit).href, context);
    }

    return next(specifier, context);
}
