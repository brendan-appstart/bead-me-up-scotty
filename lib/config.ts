import "server-only";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Local app config (NOT stored in beads). Lives as a small JSON file under the
 * OS config dir. Holds the human actor used to stamp writes, the human allowlist
 * for origin detection, the poll interval, and the registry of beads projects
 * the app knows about.
 *
 * Project identity is per-request (driven by the /p/<projectId> URL), so the
 * "active" project is NOT stored here — only the durable list of discovered ones.
 */
export interface ProjectEntry {
  id: string;
  name: string;
  path: string;
  /** ISO timestamps. */
  addedAt: string;
  lastOpened: string;
}

export interface AppConfig {
  humanActor: string;
  humanAllowlist: string[];
  pollIntervalMs: number;
  projects: ProjectEntry[];
}

/**
 * The built-in demo dataset, surfaced as an always-available pseudo-project.
 * It has no filesystem path; the store resolver maps it to the in-memory store.
 */
export const DEMO_PROJECT = {
  id: "demo",
  name: "Demo",
  path: null,
} as const;
export type DemoProject = typeof DEMO_PROJECT;

export class ConfigError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
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
    humanActor,
    humanAllowlist: [humanActor],
    // Fallback refresh interval. The SSE change stream (see lib/beads-watch)
    // drives fast updates; this interval only backstops a dropped stream.
    pollIntervalMs: 30000,
    projects: [],
  };
}

// ---- helpers -------------------------------------------------------------

function hasBeads(p: string): boolean {
  try {
    return fs.existsSync(path.join(p, ".beads"));
  } catch {
    return false;
  }
}
function realpathOrSelf(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}
function sameDir(a: string, b: string): boolean {
  return realpathOrSelf(a) === realpathOrSelf(b);
}
function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}
function makeId(absPath: string, taken: Set<string>): string {
  const base = slug(path.basename(absPath));
  let id = base;
  while (taken.has(id) || id === DEMO_PROJECT.id) {
    id = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return id;
}
function makeEntry(inputPath: string, taken: Set<string>): ProjectEntry {
  const abs = path.resolve(inputPath);
  const now = new Date().toISOString();
  return {
    id: makeId(abs, taken),
    name: path.basename(abs) || abs,
    path: abs,
    addedAt: now,
    lastOpened: now,
  };
}

/** Drop malformed registry entries so a bad config file never crashes startup. */
function sanitizeProjects(input: unknown): ProjectEntry[] {
  if (!Array.isArray(input)) return [];
  const out: ProjectEntry[] = [];
  const seen = new Set<string>();
  for (const it of input) {
    if (!it || typeof it !== "object") continue;
    const e = it as Record<string, unknown>;
    if (typeof e.id !== "string" || typeof e.path !== "string") continue;
    if (e.id === DEMO_PROJECT.id || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({
      id: e.id,
      path: e.path,
      name: typeof e.name === "string" && e.name ? e.name : path.basename(e.path) || e.path,
      addedAt: typeof e.addedAt === "string" ? e.addedAt : new Date().toISOString(),
      lastOpened: typeof e.lastOpened === "string" ? e.lastOpened : new Date().toISOString(),
    });
  }
  return out;
}

// ---- load / persist ------------------------------------------------------

let cached: AppConfig | null = null;

/**
 * Persist the config, preserving any unknown keys already on disk (e.g. the
 * legacy `repoPath`/`demo` fields) so older app versions can still read them.
 */
function persist(cfg: AppConfig): void {
  cached = cfg;
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    let base: Record<string, unknown> = {};
    try {
      base = JSON.parse(fs.readFileSync(configFile(), "utf8")) as Record<string, unknown>;
    } catch {
      base = {};
    }
    const next = { ...base, ...cfg };
    fs.writeFileSync(configFile(), JSON.stringify(next, null, 2), "utf8");
  } catch {
    /* best-effort; config still applies for the session */
  }
}

export function getConfig(): AppConfig {
  if (cached) return cached;
  const d = defaults();

  let onDisk:
    | (Partial<AppConfig> & { repoPath?: string; demo?: boolean })
    | null = null;
  try {
    onDisk = JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch {
    onDisk = null;
  }

  const merged: AppConfig = {
    humanActor: onDisk?.humanActor || d.humanActor,
    humanAllowlist:
      onDisk?.humanAllowlist && onDisk.humanAllowlist.length
        ? onDisk.humanAllowlist
        : d.humanAllowlist,
    pollIntervalMs:
      typeof onDisk?.pollIntervalMs === "number" ? onDisk.pollIntervalMs : d.pollIntervalMs,
    projects: sanitizeProjects(onDisk?.projects),
  };

  // One-time migration: back-fill the registry from the legacy single repoPath
  // (or BEADS_REPO / cwd) when no projects array exists yet.
  let migrated = false;
  if (!onDisk || onDisk.projects === undefined) {
    const legacyPath = onDisk?.repoPath || process.env.BEADS_REPO || process.cwd();
    if (
      legacyPath &&
      hasBeads(legacyPath) &&
      !merged.projects.some((p) => sameDir(p.path, legacyPath))
    ) {
      merged.projects.push(makeEntry(legacyPath, new Set(merged.projects.map((p) => p.id))));
      migrated = true;
    }
  }

  cached = merged;
  // Persist the migrated entry so its id is stable across restarts.
  if (migrated) persist(merged);
  return cached;
}

/** Update global settings (actor / allowlist / poll). Project registry has its own mutators. */
export function saveConfig(
  patch: Partial<Pick<AppConfig, "humanActor" | "humanAllowlist" | "pollIntervalMs">>,
): AppConfig {
  const next = { ...getConfig(), ...patch };
  persist(next);
  return next;
}

// ---- project registry ----------------------------------------------------

export function listProjects(): ProjectEntry[] {
  return getConfig().projects;
}

export function getProject(id: string): ProjectEntry | DemoProject | undefined {
  if (id === DEMO_PROJECT.id) return DEMO_PROJECT;
  return getConfig().projects.find((p) => p.id === id);
}

/** Add (or re-touch) a project by folder path. Validates a `.beads` dir exists. */
export function addProject(inputPath: string): ProjectEntry {
  const cfg = getConfig();
  const abs = path.resolve(inputPath);
  if (!hasBeads(abs)) {
    throw new ConfigError(`No .beads directory found in ${abs}`, "no_beads");
  }
  const existing = cfg.projects.find((p) => sameDir(p.path, abs));
  if (existing) {
    existing.lastOpened = new Date().toISOString();
    persist(cfg);
    return existing;
  }
  const entry = makeEntry(abs, new Set(cfg.projects.map((p) => p.id)));
  cfg.projects.push(entry);
  persist(cfg);
  return entry;
}

export function removeProject(id: string): void {
  const cfg = getConfig();
  cfg.projects = cfg.projects.filter((p) => p.id !== id);
  persist(cfg);
}

export function touchProject(id: string): void {
  const cfg = getConfig();
  const p = cfg.projects.find((x) => x.id === id);
  if (p) {
    p.lastOpened = new Date().toISOString();
    persist(cfg);
  }
}

export function renameProject(id: string, name: string): ProjectEntry | undefined {
  const cfg = getConfig();
  const p = cfg.projects.find((x) => x.id === id);
  if (!p) return undefined;
  p.name = name;
  persist(cfg);
  return p;
}
