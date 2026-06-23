import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
