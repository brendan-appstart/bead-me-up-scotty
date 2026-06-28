import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// Build metadata baked in at build time (bead wxu). BUILD_NUMBER = git commit
// count; BUILD_SHA = 7-char short hash. CI can override via env vars of the same
// name; falls back to empty (the badge then hides) when git is unavailable.
function git(cmd: string): string {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}
const BUILD_NUMBER = process.env.BUILD_NUMBER || git("git rev-list --count HEAD");
const BUILD_SHA = process.env.BUILD_SHA || git("git rev-parse --short=7 HEAD");

const nextConfig: NextConfig = {
  output: "standalone",
  // Inlined into the bundle (client + server) so the build badge can read them.
  env: {
    NEXT_PUBLIC_BUILD_NUMBER: BUILD_NUMBER,
    NEXT_PUBLIC_BUILD_SHA: BUILD_SHA,
  },
  // Eleventy is a CLI/Node tool we shell out to at runtime — never bundle it.
  serverExternalPackages: ["@11ty/eleventy"],
  logging: {
    // The board refetches /beads every few seconds (poll + SSE), which floods the
    // dev console. Suppress those high-frequency poll/stream request logs only —
    // every other request and all errors are still reported.
    incomingRequests: {
      ignore: [/\/api\/p\/[^/]+\/beads(\/stream)?(\?|$)/],
    },
  },
};

export default nextConfig;
