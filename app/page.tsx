import Canvas from "@/components/Canvas";
import Toolbar from "@/components/Toolbar";
import PropertiesPanel from "@/components/PropertiesPanel";

export default function Home() {
  return (
    <main className="relative w-full h-screen overflow-hidden bg-white dark:bg-zinc-950">
      <Toolbar />
      <PropertiesPanel />
      <Canvas />
    </main>
  );
}
