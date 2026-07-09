import "server-only";
import { beadSchema, type Bead, type CreateInput, type UpdateInput, type DepType, type Dependency } from "./schema";
import type { BeadsStore, DoctorInfo } from "./store";
import { demoBeads } from "./demo-data";

/**
 * In-memory store backed by the demo dataset in `lib/demo-data.ts`. Used when bd
 * isn't installed or when demo mode is forced (BEADS_DEMO env var / Settings
 * toggle). Mutations persist for the life of the dev-server process.
 */

let beads: Bead[] = demoBeads();
const nowIso = () => new Date().toISOString();

function find(id: string): Bead {
  const b = beads.find((x) => x.id === id);
  if (!b) throw new Error(`bead not found: ${id}`);
  return b;
}

export const demoStore: BeadsStore = {
  kind: "demo",
  async list() {
    return beads.map((b) => ({ ...b }));
  },
  async get(id) {
    return beads.find((b) => b.id === id) ?? null;
  },
  async create(input: CreateInput, actor: string) {
    const id = "bd-" + Math.random().toString(16).slice(2, 6);
    const dependencies: Dependency[] = [];
    if (input.parent) dependencies.push({ issue_id: id, depends_on_id: input.parent, type: "parent-child" });
    const bead = beadSchema.parse({
      id,
      title: input.title.trim(),
      issue_type: input.issue_type,
      status: input.backlog ? "deferred" : "open",
      priority: input.priority,
      assignee: input.assignee || "",
      created_by: actor,
      description: input.description ?? "",
      created_at: nowIso(),
      updated_at: nowIso(),
      closed_at: null,
      labels: input.labels ?? [],
      dependencies,
      comments: [],
      parent: input.parent || null,
    });
    beads = [...beads, bead];
    return bead;
  },
  async update(id, patch: UpdateInput) {
    const b = find(id);
    Object.assign(b, patch, { updated_at: nowIso() });
    if (patch.status === "closed" && !b.closed_at) b.closed_at = nowIso();
    return { ...b };
  },
  async setStatus(id, status) {
    const b = find(id);
    b.status = status;
    b.updated_at = nowIso();
    if (status === "in_progress" && !b.started_at) b.started_at = nowIso();
    if (status === "closed") b.closed_at = nowIso();
    return { ...b };
  },
  async remove(id) {
    beads = beads.filter((b) => b.id !== id);
  },
  async addComment(id, text, actor) {
    const b = find(id);
    b.comments = [...(b.comments ?? []), { author: actor, text, created_at: nowIso() }];
    b.updated_at = nowIso();
    return { ...b };
  },
  async addDep(id, dependsOnId, type: DepType) {
    const b = find(id);
    b.dependencies = [...(b.dependencies ?? []), { issue_id: id, depends_on_id: dependsOnId, type }];
    b.updated_at = nowIso();
    return { ...b };
  },
  async removeDep(id, dependsOnId) {
    const b = find(id);
    b.dependencies = (b.dependencies ?? []).filter((d) => d.depends_on_id !== dependsOnId);
    b.updated_at = nowIso();
    return { ...b };
  },
  async removeLabel(id, label) {
    const b = find(id);
    b.labels = (b.labels ?? []).filter((l) => l !== label);
    b.updated_at = nowIso();
    return { ...b };
  },
  async archive(id) {
    const b = find(id);
    b.status = "closed";
    b.closed_at = nowIso();
    if (!(b.labels ?? []).includes("archived")) b.labels = [...(b.labels ?? []), "archived"];
    b.updated_at = nowIso();
    return { ...b };
  },
  async doctor(): Promise<DoctorInfo> {
    return {
      kind: "demo",
      ok: true,
      repoPath: "(in-memory demo)",
      message: "Demo mode — in-memory data seeded from the design export. Install bd and point Settings at a .beads repo to use real data.",
    };
  },
};
