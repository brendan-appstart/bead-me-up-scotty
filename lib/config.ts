import "server-only";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_AI_PROVIDER, isAiProvider, type AiProvider } from "./ai-providers";
import type { FilterSet, FilterSetSnapshot } from "./filter-sets";

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
  /**
   * Manual board ordering, kept app-local (NOT in beads): projectId → columnId →
   * ordered bead ids. Lets users drag beads within a column to set work order.
   */
  orders: Record<string, Record<string, string[]>>;
  /** Named filter presets, app-local (NOT in beads): projectId → saved sets. */
  filterSets: Record<string, FilterSet[]>;
  /** Opt-in: show the gamification XP/level layer (off by default). */
  gamification: boolean;
  /** Local CLI used by Refine with AI. Default is OpenCode. */
  aiProvider: AiProvider;
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
    orders: {},
    filterSets: {},
    gamification: false,
    aiProvider: DEFAULT_AI_PROVIDER,
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

function sanitizeFilterSets(input: unknown): Record<string, FilterSet[]> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, FilterSet[]> = {};
  for (const [projectId, sets] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(sets)) continue;
    const cleaned: FilterSet[] = [];
    const seen = new Set<string>();
    for (const it of sets) {
      if (!it || typeof it !== "object") continue;
      const row = it as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.name !== "string" || !row.snapshot) continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const snap = row.snapshot as Record<string, unknown>;
      cleaned.push({
        id: row.id,
        name: row.name,
        snapshot: {
          status: Array.isArray(snap.status) ? snap.status.map(String) : [],
          type: Array.isArray(snap.type) ? snap.type.map(String) : [],
          priority: Array.isArray(snap.priority) ? snap.priority.map(Number) : [],
          origin: Array.isArray(snap.origin) ? snap.origin.map(String) : [],
          labels: Array.isArray(snap.labels) ? snap.labels.map(String) : [],
          assignee: Array.isArray(snap.assignee) ? snap.assignee.map(String) : [],
          epic: Array.isArray(snap.epic) ? snap.epic.map(String) : [],
          search: typeof snap.search === "string" ? snap.search : "",
          archived: snap.archived === true,
        },
      });
    }
    if (cleaned.length) out[projectId] = cleaned;
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
    orders:
      onDisk?.orders && typeof onDisk.orders === "object" && !Array.isArray(onDisk.orders)
        ? (onDisk.orders as Record<string, Record<string, string[]>>)
        : {},
    filterSets: sanitizeFilterSets(onDisk?.filterSets),
    gamification: typeof onDisk?.gamification === "boolean" ? onDisk.gamification : d.gamification,
    aiProvider: isAiProvider(onDisk?.aiProvider) ? onDisk.aiProvider : d.aiProvider,
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
  patch: Partial<Pick<AppConfig, "humanActor" | "humanAllowlist" | "pollIntervalMs" | "gamification" | "aiProvider">>,
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
  // Drop any saved board ordering for the removed project so it can't orphan.
  if (cfg.orders[id]) {
    const rest = { ...cfg.orders };
    delete rest[id];
    cfg.orders = rest;
  }
  if (cfg.filterSets[id]) {
    const rest = { ...cfg.filterSets };
    delete rest[id];
    cfg.filterSets = rest;
  }
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

// ---- manual board ordering ------------------------------------------------

/** All saved column orders for a project: columnId → ordered bead ids. */
export function getColumnOrders(projectId: string): Record<string, string[]> {
  return getConfig().orders[projectId] ?? {};
}

/** Replace the saved order for one column of one project. */
export function setColumnOrder(
  projectId: string,
  columnId: string,
  ids: string[],
): Record<string, string[]> {
  const cfg = getConfig();
  const proj = { ...(cfg.orders[projectId] ?? {}) };
  proj[columnId] = ids;
  cfg.orders = { ...cfg.orders, [projectId]: proj };
  persist(cfg);
  return proj;
}

// ---- named filter sets ---------------------------------------------------

const demoFilterSets: FilterSet[] = [];

function cloneSnapshot(snapshot: FilterSetSnapshot): FilterSetSnapshot {
  return {
    status: [...snapshot.status],
    type: [...snapshot.type],
    priority: [...snapshot.priority],
    origin: [...snapshot.origin],
    labels: [...snapshot.labels],
    assignee: [...snapshot.assignee],
    epic: [...snapshot.epic],
    search: snapshot.search,
    archived: snapshot.archived,
  };
}

function cloneFilterSet(set: FilterSet): FilterSet {
  return { id: set.id, name: set.name, snapshot: cloneSnapshot(set.snapshot) };
}

function makeFilterSetId(): string {
  return `fs-${Math.random().toString(36).slice(2, 10)}`;
}

function writeFilterSets(projectId: string, sets: FilterSet[]): FilterSet[] {
  const copy = sets.map(cloneFilterSet);
  if (projectId === DEMO_PROJECT.id) {
    demoFilterSets.length = 0;
    demoFilterSets.push(...copy);
    return copy.map(cloneFilterSet);
  }
  const cfg = getConfig();
  cfg.filterSets = { ...cfg.filterSets, [projectId]: copy };
  persist(cfg);
  return copy.map(cloneFilterSet);
}

/** All saved filter sets for a project. */
export function getFilterSets(projectId: string): FilterSet[] {
  if (projectId === DEMO_PROJECT.id) return demoFilterSets.map(cloneFilterSet);
  return (getConfig().filterSets[projectId] ?? []).map(cloneFilterSet);
}

/** Create a named filter set from the current snapshot. */
export function addFilterSet(
  projectId: string,
  name: string,
  snapshot: FilterSetSnapshot,
  opts?: { overwrite?: boolean },
): FilterSet[] {
  const trimmed = name.trim();
  if (!trimmed) throw new ConfigError("Filter set name is required", "invalid_name");
  const current = getFilterSets(projectId);
  const existing = current.find((set) => set.name === trimmed);
  if (existing) {
    if (!opts?.overwrite) {
      throw new ConfigError(`Filter set "${trimmed}" already exists`, "duplicate_filter_set");
    }
    return writeFilterSets(
      projectId,
      current.map((set) =>
        set.id === existing.id ? { ...set, snapshot: cloneSnapshot(snapshot) } : set,
      ),
    );
  }
  return writeFilterSets(projectId, [
    ...current,
    { id: makeFilterSetId(), name: trimmed, snapshot: cloneSnapshot(snapshot) },
  ]);
}

/** Rename a saved filter set. */
export function renameFilterSet(projectId: string, id: string, name: string): FilterSet[] {
  const trimmed = name.trim();
  if (!trimmed) throw new ConfigError("Filter set name is required", "invalid_name");
  const current = getFilterSets(projectId);
  const target = current.find((set) => set.id === id);
  if (!target) throw new ConfigError("Filter set not found", "not_found");
  if (current.some((set) => set.id !== id && set.name === trimmed)) {
    throw new ConfigError(`Filter set "${trimmed}" already exists`, "duplicate_filter_set");
  }
  return writeFilterSets(
    projectId,
    current.map((set) => (set.id === id ? { ...set, name: trimmed } : set)),
  );
}

/** Delete a saved filter set. */
export function deleteFilterSet(projectId: string, id: string): FilterSet[] {
  const current = getFilterSets(projectId);
  if (!current.some((set) => set.id === id)) {
    throw new ConfigError("Filter set not found", "not_found");
  }
  return writeFilterSets(
    projectId,
    current.filter((set) => set.id !== id),
  );
}

/** @internal Clears the in-process config cache between tests. */
export function __resetConfigCacheForTests(): void {
  cached = null;
  demoFilterSets.length = 0;
}
