import { NextResponse, type NextRequest } from "next/server";

/**
 * Viewer mode (SCOTTY_READ_ONLY=1): refuse every project-data mutation at one
 * choke point instead of guarding each route handler. Anything non-GET under
 * /api/p/ writes bead data, attachments, ordering, or publishes — all of it is
 * off-limits when the beads store is owned by an external writer (the bd CLI).
 * App-level endpoints (/api/config, /api/projects, /api/update) stay available:
 * they manage this app, not the beads data.
 *
 * The UI also hides its write affordances (via meta.readOnly), but this is the
 * authoritative guard.
 */
export function middleware(req: NextRequest) {
  const readOnly = process.env.SCOTTY_READ_ONLY === "1" || process.env.SCOTTY_READ_ONLY === "true";
  if (readOnly && req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    return NextResponse.json(
      { error: "read-only mode (SCOTTY_READ_ONLY): writes go through the bd CLI", code: "read_only" },
      { status: 403 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/p/:path*",
};
