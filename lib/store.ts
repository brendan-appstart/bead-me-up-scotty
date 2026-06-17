import "server-only";
import type { Bead, CreateInput, UpdateInput, DepType } from "./schema";
import { getConfig } from "./config";
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
  setStatus(id: string, status: string, actor: string): Promise<Bead>;
  remove(id: string, actor: string): Promise<void>;
  addComment(id: string, text: string, actor: string): Promise<Bead>;
  addDep(id: string, dependsOnId: string, type: DepType, actor: string): Promise<Bead>;
  removeDep(id: string, dependsOnId: string, actor: string): Promise<Bead>;
  archive(id: string, actor: string): Promise<Bead>;
  doctor(): Promise<DoctorInfo>;
}

let resolved: BeadsStore | null = null;

export async function getStore(): Promise<BeadsStore> {
  if (resolved) return resolved;
  const cfg = getConfig();
  if (!cfg.demo && (await isBdAvailable(cfg.repoPath))) {
    resolved = createBdStore(cfg.repoPath);
  } else {
    resolved = demoStore;
  }
  return resolved;
}

/** Reset the cached store (used after config changes). */
export function resetStore() {
  resolved = null;
}
