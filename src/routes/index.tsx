import { createFileRoute } from "@tanstack/react-router";
import DoomGame from "@/components/DoomGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Crimson Corridors — Browser FPS" },
      { name: "description", content: "A Doom-inspired raycaster FPS that runs entirely in your browser." },
      { property: "og:title", content: "Crimson Corridors" },
      { property: "og:description", content: "A Doom-inspired raycaster FPS that runs entirely in your browser." },
    ],
  }),
  component: Index,
});

function Index() {
  return <DoomGame />;
}
