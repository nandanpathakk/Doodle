import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Runs every *.test.mts in the project. Node executes TypeScript directly, so
 * there is no test framework and no build step; scripts/test-setup.mjs supplies
 * module resolution and the browser globals the store expects.
 */

const root = process.cwd();
const SKIP = new Set(["node_modules", ".next", ".git", "public", "scratchpad"]);

const findTests = (dir, found = []) => {
    for (const entry of readdirSync(dir)) {
        if (SKIP.has(entry) || entry.startsWith(".")) continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) findTests(full, found);
        else if (entry.endsWith(".test.mts")) found.push(full);
    }
    return found;
};

const files = findTests(root).sort();
if (files.length === 0) {
    console.error("no test files found");
    process.exit(1);
}

let failed = 0;
for (const file of files) {
    console.log(`\n\x1b[1m=== ${path.relative(root, file)} ===\x1b[0m`);
    const result = spawnSync(
        process.execPath,
        ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--import", "./scripts/test-setup.mjs", file],
        { stdio: "inherit", cwd: root }
    );
    if (result.status !== 0) failed++;
}

console.log(
    failed === 0
        ? `\n\x1b[32m${files.length} suite(s) passed\x1b[0m\n`
        : `\n\x1b[31m${failed} of ${files.length} suite(s) failed\x1b[0m\n`
);
process.exit(failed ? 1 : 0);
