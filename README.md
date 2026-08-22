# Doodle

A hand-drawn-style whiteboard you can share with a link.

Sketch boxes, arrows, and freehand strokes on an infinite canvas. Send someone
the link and you are both drawing on it — cursors, selections, and shapes
appearing as they are drawn.

## Features

- **Infinite canvas** with pan and zoom, in a hand-drawn style
- **Shapes, arrows, freehand, and text**, with colours, stroke styles, and layering
- **Real-time collaboration** — see each other's cursors, names, and selections
- **Follow someone's view**, so "look at this" does not mean "scroll left a bit"
- **Works offline.** Edits made with no connection merge when it comes back
- **Nothing to sign up for.** No account, no server-side storage
- **Export** to PNG, or save and reopen a `.doodle` file

## Getting started

```bash
npm install
```

**Run the app:**

```bash
npm run dev
```

Open http://localhost:3000. Everything except shared sessions works with just
this.

**Run the relay** — only needed for shared sessions. In a second terminal:

```bash
npm run server
```

It listens on `ws://localhost:1234`. Set `PORT` or `HOST` to change that, and
point the app at a different relay with `NEXT_PUBLIC_COLLAB_URL`.

## Drawing together

1. Draw something.
2. Press **Share**. Your drawing is copied into a new room and the URL becomes
   `/r/<room-id>`. You will be asked what to call yourself — the suggested name
   is fine if you would rather not.
3. Copy the invite link and open it elsewhere: another browser, another machine
   on your network, a friend's laptop.

Leaving a session returns you to your own canvas, untouched. The two are kept
separate and are never merged.

## Your drawings

They live in your browser and nowhere else. There is no database and no
account, and nothing is uploaded to be stored. Clearing site data erases them;
a different browser starts empty.

Rooms are temporary. The relay passes messages between people and keeps a room
in memory only while someone is connected — it writes nothing to disk. Anyone
with a room link can view and edit it; there is no password.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app in development |
| `npm run server` | Run the collaboration relay |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run the test suites |
| `npm run loadtest` | Measure a heavy room: bandwidth, sync times |
| `npm run lint` | Lint |

## Deploying

**The app** is a Next.js build. `/` is prerendered but room URLs are rendered on
demand, so it needs a host that runs Next.js — Vercel, or `npm run build && npm
start` on any Node host.

**The relay** is a plain Node process that needs somewhere able to hold a
WebSocket open. [`render.yaml`](render.yaml) deploys it to Render as-is: point
Render at this repo, and it picks up the blueprint.

A production build points at `wss://doodle-relay.onrender.com` by default;
development uses the local relay. To use a different one, set
`NEXT_PUBLIC_COLLAB_URL` in your host's project settings, or change the default
in `lib/collab/session.ts`. Either way you must **rebuild** — the value is
inlined into the client bundle at build time, so restarting is not enough.

On a free plan the relay is suspended after a spell with nobody using it, and
the next person to arrive waits while it starts again. Nothing is lost when this
happens: every browser holds the whole drawing. The app also pings the relay
while anyone has the page open, which keeps it awake in practice.

Before putting a relay on the public internet: there is no authentication, and
no encryption beyond your host's TLS. Anyone with a link can edit that room, and
whoever runs the relay can see its contents.

## Built with

Next.js, React, TypeScript, Zustand, [RoughJS](https://roughjs.com),
[perfect-freehand](https://github.com/steveruizok/perfect-freehand), and
[Yjs](https://github.com/yjs/yjs) for the collaborative editing.
