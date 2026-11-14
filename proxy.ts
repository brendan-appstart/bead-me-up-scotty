import { NextResponse, type NextRequest } from "next/server";
import { isReadOnly } from "@/lib/config";
import { checkRequest } from "@/lib/request-guard";

/**
 * Two request-level guards, at one choke point instead of in each handler.
 *
 * 1. Cross-site protection (every page and API request): refuse writes whose
 *    Origin is another site, and any request addressed by a hostname that DNS
 *    rebinding could forge. See lib/request-guard.ts.
 *
 * 2. Viewer mode (SCOTTY_READ_ONLY=1): refuse every project-data mutation.
 *    Anything non-GET under /api/p/ writes bead data, attachments, ordering, or
 *    publishes — all of it is off-limits when the beads store is owned by an
 *    external writer (the bd CLI). App-level endpoints (/api/config,
 *    /api/projects, /api/update) stay available: they manage this app, not the
 *    beads data. The launch flag supplies the default; a session cookie can
 *    override it for one browser. This is a local viewing preference, not
 *    access control. UI editors honor the same effective mode.
 *
 * `proxy`, not `middleware`: Next 16 deprecated the `middleware` file
 * convention in favour of `proxy` and warns on every build. The rename also
 * pins the runtime — `proxy` is always Node and cannot be configured to Edge,
 * which is what lets this read `process.env` at request time. That matters
 * here: the global install ships a pre-built `.next`, so the flags are only ever
 * set at launch, and an Edge-runtime guard with SCOTTY_READ_ONLY inlined at
 * build time would have failed open while the UI still claimed read-only.
 */
// Refusals are logged once per reason and address, so someone whose setup
// stopped working sees the fix in the terminal running Scotty, not only in
// a browser's network panel.
const reported = new Set<string>();

export function proxy(req: NextRequest) {
  const verdict = checkRequest({
    method: req.method,
    host: req.headers.get("host"),
    origin: req.headers.get("origin"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    allowedHosts: process.env.SCOTTY_ALLOWED_HOSTS,
  });
  if (!verdict.ok) {
    const key = `${verdict.code}:${verdict.error}`;
    if (!reported.has(key)) {
      reported.add(key);
      console.warn(`[scotty] ${req.method} ${req.nextUrl.pathname} refused: ${verdict.error}`);
    }
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: verdict.error, code: verdict.code }, { status: 403 });
    }
    return new NextResponse(verdict.error, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (
    req.nextUrl.pathname.startsWith("/api/p/") &&
    isReadOnly(req) && req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS"
  ) {
    return NextResponse.json(
      { error: "Read Only Mode is enabled. Use the top banner to enable editing for this browser session.", code: "read_only" },
      { status: 403 },
    );
  }
  return NextResponse.next();
}

export const config = {
  // Everything except build assets; public/ files (icons, screenshots) are
  // static and carry no project data. Under SCOTTY_BASE_PATH, Next puts the
  // base path in front of each matcher, and the second one then needs a "/"
  // after it: "/" keeps the bare base path (the launcher) guarded too.
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
