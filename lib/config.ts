import "server-only";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Local app config (NOT stored in beads). Lives as a small JSON file under the
 * OS config dir. Holds the .beads repo path, the human actor used to stamp
 * writes, the human allowlist for origin detection, and the poll interval.
 */
export interface AppConfig {
  repoPath: string;
  humanActor: string;
  humanAllowlist: string[];
  pollIntervalMs: number;
  /** Force the in-memory demo store even if bd is installed. */
  demo: boolean;
}

function configDir(): string {
  const base =
    process.env.XDG_CONFIG_HOME ||
    path.join(os.homedir(), ".config");
  return path.join(base, "bead-me-up-scotty");
}
function configFile(): string {
  return path.join(configDir(), "config.json");
}

function defaults(): AppConfig {
  let user = "you";
  try {
    user = os.userInfo().username || user;
  } catch {
    /* ignore */
  }
  const humanActor = process.env.BEADS_ACTOR || user;
  return {
    repoPath: process.env.BEADS_REPO || process.cwd(),
    humanActor,
    humanAllowlist: [humanActor],
    pollIntervalMs: 5000,
    demo: process.env.BEADS_DEMO === "1",
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const d = defaults();
  try {
    const raw = fs.readFileSync(configFile(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    cached = {
      ...d,
      ...parsed,
      humanAllowlist:
        parsed.humanAllowlist && parsed.humanAllowlist.length
          ? parsed.humanAllowlist
          : d.humanAllowlist,
    };
  } catch {
    cached = d;
  }
  return cached;
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...getConfig(), ...patch };
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify(next, null, 2), "utf8");
  } catch {
    /* best-effort; config still applies for the session */
  }
  cached = next;
  return next;
}
