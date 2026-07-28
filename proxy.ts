import { NextResponse, type NextRequest } from "next/server";
import { isReadOnly } from "@/lib/config";

/**
 * Viewer mode (SCOTTY_READ_ONLY=1): refuse every project-data mutation at one
 * choke point instead of guarding each route handler. Anything non-GET under
 * /api/p/ writes bead data, attachments, ordering, or publishes — all of it is
 * off-limits when the beads store is owned by an external writer (the bd CLI).
 * App-level endpoints (/api/config, /api/projects, /api/update) stay available:
 * they manage this app, not the beads data.
 *
 * The UI also hides its write affordances (via meta.readOnly), but this is the
 * authoritative guard — the UI gating is deliberately partial (the drawer's
 * status/priority/label/dependency controls stay mounted, as do the command
 * palette and Needs-You actions), so anything that slips through lands here and
 * surfaces as the existing `read_only` error toast.
 *
 * `proxy`, not `middleware`: Next 16 deprecated the `middleware` file
 * convention in favour of `proxy` and warns on every build. The rename also
 * pins the runtime — `proxy` is always Node and cannot be configured to Edge,
 * which is what lets this read `process.env` at request time. That matters
 * here: the global install ships a pre-built `.next`, so the flag is only ever
 * set at launch, and an Edge-runtime guard with SCOTTY_READ_ONLY inlined at
 * build time would have failed open while the UI still claimed read-only.
 */
export function proxy(req: NextRequest) {
  if (isReadOnly() && req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
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
