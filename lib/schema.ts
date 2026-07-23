import { z } from "zod";

/**
 * Canonical types mirroring the beads (bd) data model. Verified against
 * beads `internal/types/types.go` and `docs/JSON_SCHEMA.md`. We add no new
 * persisted fields — beads stays the single source of truth.
 */

export const BEAD_STATUSES = [
  "open",
  "in_progress",
  "blocked",
  "deferred",
  "closed",
  "pinned",
  "hooked",
] as const;
export type BeadStatus = (typeof BEAD_STATUSES)[number];

// Human-facing subset of bd issue_type (internal molecule/gate/event omitted).
export const BEAD_TYPES = [
  "task",
  "feature",
  "bug",
  "chore",
  "epic",
  "decision",
  "spike",
  "story",
  "milestone",
] as const;
export type BeadType = (typeof BEAD_TYPES)[number];

export const DEP_TYPES = [
  "blocks",
  "parent-child",
  "conditional-blocks",
  "waits-for",
  "related",
  "relates-to",
  "discovered-from",
  "duplicates",
  "supersedes",
  "caused-by",
  "validates",
  "tracks",
] as const;
export type DepType = (typeof DEP_TYPES)[number];

// Dep types that block the ready queue (beads semantics).
export const BLOCKING_DEP_TYPES: DepType[] = [
  "blocks",
  "parent-child",
  "conditional-blocks",
  "waits-for",
];

export const PRIORITIES = [0, 1, 2, 3, 4] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Loose enums: accept unknown values from bd without throwing (forward-compat). */
const statusSchema = z.string();
const typeSchema = z.string();

/** Flat dependency link records, as emitted by `bd export --json`. */
const flatDepSchema = z
  .object({
    issue_id: z.string().optional(),
    depends_on_id: z.string(),
    type: z.string(),
    created_by: z.string().optional(),
    created_at: z.string().optional(),
  });

/**
 * `bd show --json` instead expands each dependency into the full target bead
 * ({ id, title, status, …, dependency_type }). Normalize that shape to the
 * flat link record so consumers see a single canonical Dependency type
 * (gh-12). The two shapes are disjoint: flat has depends_on_id/type, expanded
 * has id/dependency_type. The expanded record's created_at/created_by belong
 * to the target bead, not the link, so they are intentionally not mapped.
 */
const expandedDepSchema = z
  .object({ id: z.string(), dependency_type: z.string() })
  .transform((d): z.infer<typeof flatDepSchema> => ({
    depends_on_id: d.id,
    type: d.dependency_type,
  }));

export const dependencySchema = z.union([flatDepSchema, expandedDepSchema]);
export type Dependency = z.infer<typeof flatDepSchema>;

export const commentSchema = z
  .object({
    id: z.string().optional(),
    issue_id: z.string().optional(),
    author: z.string().default(""),
    text: z.string().default(""),
    created_at: z.string().optional(),
  });
export type Comment = z.infer<typeof commentSchema>;

export const beadSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional().default(""),
    notes: z.string().optional().default(""),
    design: z.string().optional().default(""),
    acceptance_criteria: z.string().optional().default(""),
    status: statusSchema,
    priority: z.coerce.number().int().min(0).max(4).default(2),
    issue_type: typeSchema,
    assignee: z.string().optional().default(""),
    owner: z.string().optional(),
    created_by: z.string().optional().default(""),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    started_at: z.string().optional().nullable(),
    closed_at: z.string().optional().nullable(),
    labels: z.array(z.string()).optional().default([]),
    dependencies: z.array(dependencySchema).optional().default([]),
    comments: z.array(commentSchema).optional().default([]),
    dependency_count: z.number().optional(),
    dependent_count: z.number().optional(),
    comment_count: z.number().optional(),
    parent: z.string().nullable().optional(),
    /**
     * Gate sub-type from `bd gate create --type <t>` (human | timer | gh:run |
     * gh:pr | bead). Present only on issue_type "gate". Preserved here — zod
     * strips unknown keys — so the UI can surface human-approval gates that are
     * waiting on a person (bead 8qc / gh-6).
     */
    await_type: z.string().optional(),
  });
export type Bead = z.infer<typeof beadSchema>;

export const beadArraySchema = z.array(beadSchema);

/** bd --json envelope: { schema_version, data } (BD_JSON_ENVELOPE=1). */
export function unwrapEnvelope(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "data" in (raw as Record<string, unknown>)) {
    return (raw as Record<string, unknown>).data;
  }
  return raw;
}

// ---- Input shapes for writes ----

export const createInputSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  issue_type: z.enum(BEAD_TYPES).default("task"),
  priority: z.coerce.number().int().min(0).max(4).default(2),
  description: z.string().optional().default(""),
  assignee: z.string().optional().default(""),
  labels: z.array(z.string()).optional().default([]),
  parent: z.string().optional().default(""),
  /** When true, the bead starts in the Backlog (deferred) instead of Ready. */
  backlog: z.boolean().optional().default(false),
});
export type CreateInput = z.infer<typeof createInputSchema>;

export const updateInputSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  status: z.enum(BEAD_STATUSES).optional(),
  priority: z.coerce.number().int().min(0).max(4).optional(),
  issue_type: z.enum(BEAD_TYPES).optional(),
  assignee: z.string().optional(),
});
export type UpdateInput = z.infer<typeof updateInputSchema>;

export const addCommentSchema = z.object({ text: z.string().min(1) });

export const addDepSchema = z.object({
  depends_on_id: z.string().min(1),
  type: z.enum(DEP_TYPES).default("blocks"),
});
