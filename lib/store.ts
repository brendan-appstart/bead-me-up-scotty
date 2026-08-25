import "server-only";
import type { Bead, CreateInput, UpdateInput, DepType } from "./schema";
import type { Formula, FormulaListEntry, PourFormulaInput, PourResult } from "./formulas";
import { getProject, touchProject, DEMO_PROJECT, ConfigError } from "./config";
import { createBdStore, isBdAvailable } from "./bd";
import { demoStore } from "./demo-store";

/**
 * Storage abstraction. Two implementations:
 *  - BdStore  → shells out to the `bd` CLI (source of truth).
 *  - DemoStore → in-memory, seeded from the design export, so the app runs and
 *    is demoable even where bd isn't installed.
 */
export interface DoctorInfo {
  kind: "bd" | "demo";
  ok: boolean;
  version?: string;
  repoPath: string;
  message: string;
}

export interface BeadsStore {
  kind: "bd" | "demo";
  list(): Promise<Bead[]>;
  get(id: string): Promise<Bead | null>;
  create(input: CreateInput, actor: string): Promise<Bead>;
  update(id: string, patch: UpdateInput, actor: string): Promise<Bead>;
  /**
   * `reason` is only meaningful when closing — bd records it via
   * `bd close --reason`, and there is no way to attach one after the fact.
   */
  setStatus(id: string, status: string, actor: string, reason?: string): Promise<Bead>;
  /** Snooze a bead until a date/phrase (`bd defer --until`). */
  defer(id: string, until: string, actor: string, reason?: string): Promise<Bead>;
  remove(id: string, actor: string): Promise<void>;
  addComment(id: string, text: string, actor: string): Promise<Bead>;
  addDep(id: string, dependsOnId: string, type: DepType, actor: string): Promise<Bead>;
  removeDep(id: string, dependsOnId: string, actor: string): Promise<Bead>;
  /** Create a human approval gate that blocks `blocks` (`bd gate create --type human`). */
  createGate(blocks: string, reason: string | undefined, actor: string): Promise<Bead>;
  removeLabel(id: string, label: string, actor: string): Promise<Bead>;
  archive(id: string, actor: string): Promise<Bead>;
  /** Catalog of workflow formulas (`bd formula list --json`). Not beads. */
  listFormulas(): Promise<FormulaListEntry[]>;
  /** Full formula (`bd formula show --json`), or null if unknown. */
  showFormula(name: string): Promise<Formula | null>;
  /**
   * Instantiate a formula via `bd mol pour` or `bd mol wisp`.
   * Required vars are Zod-validated before spawn.
   */
  pourFormula(input: PourFormulaInput): Promise<PourResult>;
  doctor(): Promise<DoctorInfo>;
}

// One store per project id. Demo always maps to the shared in-memory store.
const stores = new Map<string, BeadsStore>();

export async function getStore(projectId: string): Promise<BeadsStore> {
  if (projectId === DEMO_PROJECT.id) return demoStore;

  const cached = stores.get(projectId);
  if (cached) return cached;

  const project = getProject(projectId);
  if (!project || project.path === null) {
    throw new ConfigError(`Unknown project: ${projectId}`, "unknown_project");
  }
  if (!(await isBdAvailable(project.path))) {
    throw new ConfigError(
      `bd is not available for "${project.name}" (${project.path}). ` +
        `Check that bd is installed and the folder still contains a .beads directory.`,
      "bd_unavailable",
    );
  }
  const store = createBdStore(project.path);
  stores.set(projectId, store);
  // First resolution this session — record that the project was opened.
  touchProject(projectId);
  return store;
}

/** Reset cached store(s) — one project, or all when no id is given. */
export function resetStore(projectId?: string) {
  if (projectId) stores.delete(projectId);
  else stores.clear();
}
