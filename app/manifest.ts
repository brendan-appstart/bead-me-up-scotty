import type { MetadataRoute } from "next";
import { APP_TITLE } from "@/lib/app-title";

// Lets Chrome, Edge and Safari install the app in its own window. The
// installed app is bound to this origin's port, hence the stable-port logic
// in bin/bead-me-up-scotty.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_TITLE,
    short_name: "Scotty",
    description: "A local web UI for the beads (bd) issue tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f8",
    theme_color: "#6d5ef0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
