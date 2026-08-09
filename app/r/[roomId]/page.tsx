"use client";

import { use } from "react";
import DoodleApp from "@/components/DoodleApp";

/**
 * A collaborative session. The roomId names both the relay room and this
 * client's local copy of it, which is kept separate from the solo canvas.
 */
export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
    const { roomId } = use(params);
    return <DoodleApp roomId={roomId} />;
}
