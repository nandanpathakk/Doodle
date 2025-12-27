"use client";

import Canvas from "@/components/Canvas";
import Toolbar from "@/components/Toolbar";
import PropertiesPanel from "@/components/PropertiesPanel";
import { useStore } from "@/store/useStore";

export default function Home() {
  const isDarkMode = useStore((state) => state.isDarkMode);

  return (
    <main className={`relative w-full h-screen overflow-hidden ${isDarkMode ? 'dark bg-[#121212]' : 'bg-white'}`}>
      <Toolbar />
      <PropertiesPanel />
      <Canvas />
    </main>
  );
}
