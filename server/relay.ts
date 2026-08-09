import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

/**
 * Relay for collaborative sessions.
 *
 * Rooms are ephemeral by design: the server holds a document only while someone
 * is connected and drops it when the last person leaves. Nothing is written to
 * disk, so there is no storage to grow, no retention policy, and no copy of
 * anyone's drawing left behind. Each client keeps its own copy in IndexedDB, so
 * a room that empties and is rejoined is repopulated by whoever rejoins — and
 * because the documents are CRDTs, several peers rejoining merge rather than
 * clobber.
 *
 * The server understands the Yjs sync protocol rather than blindly relaying
 * bytes, so a client joining late is caught up from the in-memory document
 * instead of having to wait for someone else to make an edit.
 *
 * Started by server/index.ts; exported as a function so tests can run a relay
 * in-process on an ephemeral port.
 */

/** Modest ceilings so a single client cannot exhaust the process. */
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
const MAX_ROOMS = 500;
const MAX_CONNECTIONS_PER_ROOM = 64;
const HEARTBEAT_INTERVAL_MS = 30_000;

// Message types, matching the y-websocket client.
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

interface Room {
    name: string;
    doc: Y.Doc;
    awareness: awarenessProtocol.Awareness;
    /** Connection -> the awareness client ids it is responsible for. */
    connections: Map<WebSocket, Set<number>>;
}

export interface Relay {
    /** Port actually bound — useful when starting on port 0. */
    port: number;
    /** Number of rooms currently open. Rooms close when the last client leaves. */
    roomCount: () => number;
    close: () => Promise<void>;
}

export function startRelay(options: { port?: number; host?: string } = {}): Promise<Relay> {
const rooms = new Map<string, Room>();

const send = (socket: WebSocket, payload: Uint8Array) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
        socket.send(payload);
    } catch {
        socket.close();
    }
};

const broadcast = (room: Room, payload: Uint8Array, except?: WebSocket) => {
    room.connections.forEach((_ids, socket) => {
        if (socket !== except) send(socket, payload);
    });
};

const createRoom = (name: string): Room => {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    // The server holds no presence of its own.
    awareness.setLocalState(null);

    const room: Room = { name, doc, awareness, connections: new Map() };

    doc.on("update", (update: Uint8Array, origin: unknown) => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeUpdate(encoder, update);
        // Skip the sender: it already has this change locally.
        broadcast(room, encoding.toUint8Array(encoder), origin instanceof WebSocket ? origin : undefined);
    });

    awareness.on(
        "update",
        (
            { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
            origin: unknown
        ) => {
            const changed = added.concat(updated, removed);
            if (changed.length === 0) return;
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(awareness, changed)
            );
            broadcast(room, encoding.toUint8Array(encoder), origin instanceof WebSocket ? origin : undefined);
        }
    );

    rooms.set(name, room);
    console.log(`[room] ${name} opened (${rooms.size} open)`);
    return room;
};

const closeRoomIfEmpty = (room: Room) => {
    if (room.connections.size > 0) return;
    room.awareness.destroy();
    room.doc.destroy();
    rooms.delete(room.name);
    console.log(`[room] ${room.name} closed (${rooms.size} open)`);
};

const handleMessage = (room: Room, socket: WebSocket, data: Uint8Array) => {
    const decoder = decoding.createDecoder(data);
    const encoder = encoding.createEncoder();

    switch (decoding.readVarUint(decoder)) {
        case MESSAGE_SYNC: {
            encoding.writeVarUint(encoder, MESSAGE_SYNC);
            // `socket` becomes the transaction origin, so the doc update handler
            // above can avoid echoing the change back to its sender.
            syncProtocol.readSyncMessage(decoder, encoder, room.doc, socket);
            // Length 1 means the reply is just the header: nothing to say.
            if (encoding.length(encoder) > 1) send(socket, encoding.toUint8Array(encoder));
            break;
        }
        case MESSAGE_AWARENESS: {
            awarenessProtocol.applyAwarenessUpdate(
                room.awareness,
                decoding.readVarUint8Array(decoder),
                socket
            );
            break;
        }
        default:
            break; // unknown message type: ignore rather than drop the connection
    }
};

const roomNameFromUrl = (url: string | undefined): string => {
    const path = (url ?? "/").split("?")[0];
    return decodeURIComponent(path.replace(/^\/+/, "")).slice(0, 128);
};

const server = new WebSocketServer({
    host: options.host ?? "0.0.0.0",
    port: options.port ?? 1234,
    maxPayload: MAX_MESSAGE_BYTES,
});

server.on("connection", (socket, request) => {
    const name = roomNameFromUrl(request.url);
    if (!name) {
        socket.close(1008, "room name required");
        return;
    }

    const existing = rooms.get(name);
    if (!existing && rooms.size >= MAX_ROOMS) {
        socket.close(1013, "too many rooms");
        return;
    }

    const room = existing ?? createRoom(name);
    if (room.connections.size >= MAX_CONNECTIONS_PER_ROOM) {
        socket.close(1013, "room is full");
        return;
    }

    socket.binaryType = "arraybuffer";
    room.connections.set(socket, new Set());

    // Step 1 of the sync protocol: our state vector, so the client can work out
    // what we are missing and reply with only that.
    const syncEncoder = encoding.createEncoder();
    encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(syncEncoder, room.doc);
    send(socket, encoding.toUint8Array(syncEncoder));

    // Catch the newcomer up on who else is here.
    const presentClients = [...room.awareness.getStates().keys()];
    if (presentClients.length > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
            awarenessEncoder,
            awarenessProtocol.encodeAwarenessUpdate(room.awareness, presentClients)
        );
        send(socket, encoding.toUint8Array(awarenessEncoder));
    }

    // Track which awareness clients this connection owns, so its presence can be
    // withdrawn when it drops rather than lingering as a ghost cursor.
    const trackOwnedClients = (
        { added, updated }: { added: number[]; updated: number[] },
        origin: unknown
    ) => {
        if (origin !== socket) return;
        const owned = room.connections.get(socket);
        if (owned) added.concat(updated).forEach((id) => owned.add(id));
    };
    room.awareness.on("update", trackOwnedClients);

    let alive = true;
    socket.on("pong", () => { alive = true; });
    const heartbeat = setInterval(() => {
        if (!alive) {
            socket.terminate();
            return;
        }
        alive = false;
        try {
            socket.ping();
        } catch {
            socket.terminate();
        }
    }, HEARTBEAT_INTERVAL_MS);

    socket.on("message", (data: ArrayBuffer | Buffer) => {
        try {
            handleMessage(room, socket, new Uint8Array(data as ArrayBuffer));
        } catch (error) {
            // A malformed message from one client must not take the room down.
            console.error(`[room] ${room.name} bad message:`, error);
        }
    });

    const cleanup = () => {
        clearInterval(heartbeat);
        room.awareness.off("update", trackOwnedClients);
        const owned = room.connections.get(socket);
        room.connections.delete(socket);
        if (owned && owned.size > 0) {
            awarenessProtocol.removeAwarenessStates(room.awareness, [...owned], null);
        }
        closeRoomIfEmpty(room);
    };

    socket.on("close", cleanup);
    socket.on("error", cleanup);
});

return new Promise<Relay>((resolve, reject) => {
    server.on("error", reject);
    server.on("listening", () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : (options.port ?? 1234);
        resolve({
            port,
            roomCount: () => rooms.size,
            close: () =>
                new Promise<void>((done) => {
                    rooms.forEach((room) =>
                        room.connections.forEach((_ids, socket) => socket.close(1001, "server shutting down"))
                    );
                    server.close(() => done());
                }),
        });
    });
});
}
