# Real-time collaboration

Design notes and running status. Commit messages carry the detail for each
step; this is the map.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Sync algorithm | **Yjs** (CRDT) | Per-field merge, so "A recolours while B drags" keeps both. Last-write-wins per element drops one of them. |
| Z-order | **Fractional index** on each element | Array reordering is the one operation CRDTs handle badly; this turns it into "set one string field". |
| Transport | **Raw WebSocket** (`y-websocket`) | `y-websocket` is a protocol implementation, not just a transport — state-vector sync and awareness come with it. socket.io would mean hand-writing that, and `y-socket.io` pulls in `y-leveldb` (native build). |
| Rooms | **Ephemeral** | Server relays and holds a doc only while someone is connected. No server storage, no retention question. Each client keeps its own copy in IndexedDB. |
| Server host | **Plain Node + `ws`** | Runs locally and deploys unchanged anywhere. Cloudflare Durable Objects would be a rewrite, so it was worth not committing to. |
| E2E encryption | **Deferred** | Ephemeral rooms + self-hosting make it optional. The message layer is kept encryption-shaped so it stays a contained change. |
| Undo | **`Y.UndoManager`, `trackedOrigins`** | Snapshot undo and shared editing are incompatible: restoring a snapshot discards whatever arrived after it. |

### Dependencies

Chosen against a hard constraint: no install scripts, no native code, no paid
services. Verified at install time — `npm audit` clean, nothing runs on install.

`yjs`, `lib0`, `isomorphic.js`, `y-protocols`, `y-indexeddb`,
`fractional-indexing` (browser); `y-websocket` (browser), `ws` (server only).

Deliberately **not** used: `y-leveldb` (native `node-gyp` build — server
persistence is a plain file write instead, or `node:sqlite` if it outgrows
that), `socket.io`.

## Invariants

Things that are load-bearing and not obvious from a casual read.

- **Echo suppression** (`lib/collab/binding.ts`). `updateElement` bumps
  `version` on every pointer move, so a write echoing back and being re-applied
  is an endless loop. Three overlapping defences: origin tagging, a
  suppression flag while applying, and pushes diffing against the document so a
  redundant push writes nothing. Tests assert on *counts* of document updates,
  because a loop converges on the right answer while still writing forever.
- **Seeding direction.** On reload the store is empty and the document is not.
  Binding must pull before it pushes, or it wipes the drawing.
- **Gesture bounds** (`hooks/useCanvasLogic.ts`). A gesture is closed on
  pointer release *and* on the next pointer press (capture phase). The second
  matters because some edits open a gesture from a handler that fires after
  release — `onClick` on a colour swatch, `dblclick` creating text.
- **`elements` vs `allElements`** (`store/useStore.ts`). `elements` is what you
  see (no tombstones) and keeps the plain name, so any consumer that forgets
  the distinction fails safe. `allElements` is for persistence and sync only.
- **Legacy import flag** (`lib/collab/legacy.ts`). Keyed off an explicit flag,
  not "document is empty" — otherwise garbage collecting the last tombstone
  would resurrect a deleted drawing.
- **Undo manager is created after binding**, so restoring a drawing on load is
  not itself undoable.
- **Two documents, never merged.** The solo canvas (`doodle-local`) and a room
  (`doodle-room-<id>`) are separate. Starting a session copies the current
  drawing into a new room; joining someone's link must not push your canvas
  into theirs.
- **Session ownership token** (`lib/collab/useCollab.ts`). React does not
  guarantee the old session's cleanup runs before the new session's effect, so
  teardown only resets shared state if it still owns it. Without this a
  late-arriving cleanup clears the store — and, because the new session is
  already bound, pushes that emptiness into the new document.
- **The room seed is read without being consumed** (`lib/collab/session.ts`).
  React invokes effects twice in development; a destructive read means the
  discarded first pass eats the seed and the real one starts empty.
- **Presence publishes on a timer, not requestAnimationFrame**
  (`lib/collab/presence.ts`). rAF does not run in a hidden tab, so switching
  away mid-move strands the pending publish and peers keep seeing a cursor that
  has gone. Timers still fire when hidden.
- **Remote presence never enters React state.** At ~30Hz per peer it would
  re-render the app hundreds of times a second; the overlay reads it directly
  on its frame loop. Only the roster reaches React, via useSyncExternalStore.

## Latency design

The point of the architecture, in one place.

1. **Two channels.** Committed elements go in the document. Cursors,
   selections, and *in-flight* gesture geometry go over awareness — ephemeral,
   unpersisted, outside undo history. A 400-point pencil stroke is one document
   op, not 400.
2. **Overlay canvas** (`lib/overlay.ts`). Remote cursors at ~30Hz per peer must
   not repaint the drawing or re-run RoughJS.
3. **Cursor interpolation.** Lerp between updates; 30Hz data on a 120Hz display
   is the difference between smooth and steppy. *(done — lib/overlay.ts)*
4. **Outbound coalescing.** One awareness publish per animation frame.
5. **Stroke simplification.** RDP before commit; ~400 points to ~60.

## Status

- [x] **0a** Fractional z-order
- [x] **0b** Soft deletes (tombstones + GC)
- [x] **0c** Gesture lifecycle
- [x] **0d** Overlay canvas layer
- [x] **1a/1b** Yjs document + binding + IndexedDB persistence
- [x] **1c** Per-user undo
- [ ] **1d** `Y.Text` for element text — optional; only matters when two people
      edit the *same* text element at once. Today it is last-write-wins.
- [x] **2** Server + rooms (relay, `/r/[roomId]`, start/join/leave)
- [x] **3a** Presence: remote cursors, peer selections, avatars, rename
- [ ] **3b** In-flight gesture streaming (draft strokes) and viewport follow
- [ ] **4** Smoothness (interpolation, coalescing, RDP, load test)
- [ ] **5** Optional E2E encryption

### Deferred, with reasons

- **Pointer Events migration.** Originally scoped into 0d. It is an input-layer
  rewrite of the touch and pinch-zoom paths, which cannot be exercised in the
  dev environment, and it is independent of collaboration. Its real payoff is
  `getCoalescedEvents()` for stroke fidelity, which belongs with the Phase 4
  stroke work.

## Testing

`npm test` — no framework, no build step; Node runs TypeScript directly.
`scripts/test-setup.mjs` supplies the `@/` alias and the browser globals the
store touches on import.
