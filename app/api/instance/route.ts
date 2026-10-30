import { createHash } from "node:crypto";
import packageInfo from "@/package.json";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

// Settings the server reads from its environment, which only take effect when
// it starts. bin/bead-me-up-scotty.mjs refuses to reuse this instance when its
// own values differ.
const LAUNCH_ENV = [
  "BD_BIN",
  "BEADS_ACTOR",
  "BEADS_DEMO",
  "BEADS_FS_ROOT",
  "BEADS_REPO",
  "CLAUDE_BIN",
  "POSTHOG_HOST",
  "POSTHOG_KEY",
  "SCOTTY_ALLOWED_HOSTS",
  "SCOTTY_LANE_PREFIX",
  "SCOTTY_READ_ONLY",
  "XDG_CONFIG_HOME",
];

// Hashed so the endpoint doesn't hand out tokens and paths; the launcher
// hashes its own values the same way. Unset stays null: an empty POSTHOG_KEY
// means something different from no POSTHOG_KEY.
const hash = (v: string | undefined) =>
  v === undefined ? null : createHash("sha256").update(v).digest("hex").slice(0, 16);

/** Identifies a running Scotty to the launcher, which probes it before reusing it. */
export async function GET() {
  return ok({
    name: packageInfo.name,
    version: packageInfo.version,
    buildId: process.env.SCOTTY_BUILD_ID,
    launch: Object.fromEntries(LAUNCH_ENV.map((k) => [k, hash(process.env[k])])),
  });
}
