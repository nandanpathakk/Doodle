import { startRelay } from "./relay.ts";

/**
 * CLI entry for the collaboration relay.
 *
 * Run with: npm run server
 * Configure with PORT / HOST.
 */

const port = Number(process.env.PORT ?? 1234);
const host = process.env.HOST ?? "0.0.0.0";

const relay = await startRelay({ port, host });

console.log(`Doodle collaboration relay on ws://${host}:${relay.port}`);
console.log("Rooms are ephemeral — nothing is written to disk.");

const shutdown = () => {
    console.log("\nShutting down…");
    relay.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
