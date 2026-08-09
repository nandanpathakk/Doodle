"use client";

import Canvas from "@/components/Canvas";
import Toolbar from "@/components/Toolbar";
import PropertiesPanel from "@/components/PropertiesPanel";
import SessionIndicator from "@/components/SessionIndicator";
import { useStore } from "@/store/useStore";
import { useCollab } from "@/lib/collab/useCollab";

/**
 * The app itself, shared by the solo canvas and a room so the two cannot drift
 * apart. `roomId` decides which document this session is attached to.
 */
export default function DoodleApp({ roomId = null }: { roomId?: string | null }) {
    const isDarkMode = useStore((state) => state.isDarkMode);

    useCollab(roomId);

    return (
        <main className={`relative w-full h-screen overflow-hidden ${isDarkMode ? "dark bg-[#121212]" : "bg-white"}`}>
            <Toolbar />
            <PropertiesPanel />
            <Canvas />
            <SessionIndicator />
        </main>
    );
}
