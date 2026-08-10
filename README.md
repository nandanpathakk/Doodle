# Doodle

A hand-drawn-style whiteboard, with real-time collaboration.

## Running it

Two processes. The app works on its own; the relay is only needed for shared
sessions.

```bash
npm install
```

**The app** — everything except collaborative sessions works with just this:

```bash
npm run dev
```

Then open http://localhost:3000.

**The relay** — needed for shared sessions. Run it in a second terminal:

```bash
npm run server
```

It listens on `ws://localhost:1234`. Set `PORT` or `HOST` to change that, and
point the app at a different relay with `NEXT_PUBLIC_COLLAB_URL`.

### Drawing together

1. Open the app, draw something.
2. **Menu → Start session.** Your drawing is copied into a new room and the URL
   becomes `/r/<room-id>`.
3. Copy the invite link from the indicator at the bottom right, and open it
   elsewhere — another browser, another machine on your network, another tab.

You should see each other's cursors and names, what the other has selected, and
shapes appearing as they are drawn rather than when the mouse is released.

Leaving a session returns you to your own canvas, untouched. The two are
separate documents and are never merged.

## Other commands

| Command | What it does |
|---|---|
| `npm run dev` | App in development |
| `npm run server` | Collaboration relay |
| `npm test` | Test suites (no framework — Node runs the TypeScript directly) |
| `npm run lint` | Lint |
| `npm run build` | Production build |
| `npm start` | Serve the production build |

## How the collaboration works

Short version: elements live in a [Yjs](https://github.com/yjs/yjs) CRDT
persisted to IndexedDB, and a small WebSocket relay passes updates between
peers. Rooms are ephemeral — the server keeps a document only while someone is
connected, and writes nothing to disk. Every client keeps its own copy, so
offline edits merge on reconnect.

Cursors, selections, and in-progress strokes travel on a separate ephemeral
channel, so a drag is one document update rather than one per pointer move.

[`docs/collaboration.md`](docs/collaboration.md) has the design, the reasoning
behind each decision, and the invariants worth knowing before changing any of
it.

## Deploying

The app is a static Next.js build and deploys anywhere. The relay is a plain
Node process (`server/index.ts`, run with `npm run server`) and needs somewhere
that can hold a WebSocket open — a small VM, Fly.io, Render, or similar. Point
the app at it with `NEXT_PUBLIC_COLLAB_URL=wss://your-relay-host`.
