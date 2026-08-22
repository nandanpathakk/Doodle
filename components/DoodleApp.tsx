"use client";

import { useEffect } from "react";
import Canvas from "@/components/Canvas";
import Toolbar from "@/components/Toolbar";
import PropertiesPanel from "@/components/PropertiesPanel";
import SessionBar from "@/components/SessionBar";
import { useStore } from "@/store/useStore";
import { useCollab } from "@/lib/collab/useCollab";
import { startWarmingRelay } from "@/lib/warmRelay";

/**
 * The app itself, shared by the solo canvas and a room so the two cannot drift
 * apart. `roomId` decides which document this session is attached to.
 */
export default function DoodleApp({ roomId = null }: { roomId?: string | null }) {
    const isDarkMode = useStore((state) => state.isDarkMode);
    const roomName = useStore((state) => state.roomName);

    useCollab(roomId);

    // The tab is how you find a room again among a dozen others, so it carries
    // the room's name once the document has one. Set here rather than through
    // Next's metadata because the name is client-side state that arrives on
    // sync, not something the server knows when it renders the page.
    useEffect(() => {
        document.title = roomName ? `${roomName} · Doodle` : "Doodle";
    }, [roomName]);

    // Unrelated to the above, and deliberately so: a free host suspends an idle
    // service, so this nudges it awake from the moment the page opens rather
    // than when someone presses Share. It runs on the solo canvas too, because
    // that is where sharing starts. See lib/warmRelay.ts — it shares nothing
    // with the sync layer and removing it changes no behaviour.
    useEffect(() => startWarmingRelay(), []);

    return (
        <main className={`relative w-full h-screen overflow-hidden ${isDarkMode ? "dark bg-[#121212]" : "bg-white"}`}>
            <Toolbar />
            <PropertiesPanel />
            <Canvas />
            <SessionBar />
        </main>
    );
}
