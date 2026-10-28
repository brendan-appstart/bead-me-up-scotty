import type { Bead } from "./schema";
import { BLOCKING_DEP_TYPES } from "./schema";

/**
 * Pure view-model helpers, ported from the Claude Design export prototype.
 * Framework-agnostic so they can run on the server and the client.
 */

/**
 * A bead needs a human decision when it carries the `human` label (set by
 * `bd human`) and is still actionable (not closed or deferred). Drives the
 * "Needs You" inbox and its sidebar count badge.
 */
export function needsHuman(b: Bead): boolean {
  return (b.labels ?? []).includes("human") && b.status !== "closed" && b.status !== "deferred";
}

/**
 * A human-approval gate: an `issue_type === "gate"` bead created by
 * `bd gate create --type human`. Unlike `bd human` (a label on a normal bead),
 * a gate is its own bead whose sub-type lives in `await_type`, so it never
 * carries the `human` label and `needsHuman()` misses it.
 */
export function isHumanGate(b: Bead): boolean {
  return b.issue_type === "gate" && b.await_type === "human";
}

/**
 * A human-approval gate that is unresolved and not itself blocked — its own
 * blockers (if any) are all closed, so a person can approve/resolve it now.
 * These belong on the "Needs You" inbox alongside `needsHuman()` beads
 * (bead 8qc / gh-6). Resolving = closing the gate, which unblocks its dependents.
 */
export function readyHumanGate(b: Bead, index: Map<string, Bead>): boolean {
  return isHumanGate(b) && b.status !== "closed" && !isBlocked(b, index);
}

/** Beads that this gate blocks (they depend on it via a blocking dep). */
export function gateBlocks(gateId: string, beads: Bead[]): Bead[] {
  return beads.filter((b) =>
    (b.dependencies ?? []).some((d) => d.depends_on_id === gateId && BLOCKING_DEP_TYPES.includes(d.type as never)),
  );
}

/**
 * GFM task-list ("- [ ]" / "- [x]") helpers. Checklists live in the bead
 * description text itself (zero new schema), so toggling rewrites the markdown.
 */
const TASK_RE = /^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX])\]/gm;

export function checklistProgress(text?: string | null): { done: number; total: number } {
  if (!text) return { done: 0, total: 0 };
  const re = new RegExp(TASK_RE);
  let done = 0;
  let total = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    total++;
    if (m[2].toLowerCase() === "x") done++;
  }
  return { done, total };
}

/** Flip the Nth task checkbox (0-based, document order) and return the new text. */
export function toggleTask(text: string, index: number): string {
  let i = 0;
  return text.replace(TASK_RE, (full, prefix: string, mark: string) => {
    if (i++ !== index) return full;
    return `${prefix}[${mark.toLowerCase() === "x" ? " " : "x"}]`;
  });
}

/**
 * `bd close` with no `--reason` still records a reason: the literal "Closed".
 * That placeholder carries no information, so treat it as absent rather than
 * rendering a "Close reason" section that just says "Closed".
 */
export function closeReasonOf(b: Bead): string {
  const reason = b.close_reason?.trim() ?? "";
  return reason.toLowerCase() === "closed" ? "" : reason;
}

export type StatusCategory = "done" | "wip" | "blocked" | "frozen" | "active";

export function category(status: string): StatusCategory {
  if (status === "closed") return "done";
  if (status === "in_progress" || status === "hooked") return "wip";
  if (status === "blocked") return "blocked";
  if (status === "deferred" || status === "pinned") return "frozen";
  return "active";
}

const CAT_COLORS: Record<StatusCategory, string> = {
  done: "#16a34a",
  wip: "#d97706",
  blocked: "#ef4444",
  frozen: "#64748b",
  active: "#3b82f6",
};
export function catColor(status: string): string {
  return CAT_COLORS[category(status)];
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  deferred: "Deferred",
  closed: "Closed",
  pinned: "Pinned",
  hooked: "Hooked",
};
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const PRIO_COLORS = ["#ef4444", "#f97316", "#eab308", "#0ea5e9", "#64748b"];
const PRIO_LABELS = ["Critical", "High", "Medium", "Low", "Backlog"];
export function prioColor(p: number): string {
  return PRIO_COLORS[p] ?? "#64748b";
}
export function prioLabel(p: number): string {
  return PRIO_LABELS[p] ?? String(p);
}

export function typeColor(t: string): string {
  if (t === "epic") return "var(--brand)";
  if (t === "bug") return "#ef4444";
  return "var(--text-3)";
}
export function typeLabel(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const AVATARS = [
  "#6d5ef0",
  "#0ea5e9",
  "#16a34a",
  "#d97706",
  "#db2777",
  "#0891b2",
  "#7c3aed",
];
export function avatarColor(name: string): string {
  if (!name) return "#9aa0aa";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
export function initials(name: string): string {
  if (!name) return "?";
  const parts = name.split(/[-_ .]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ---- relationship helpers (need the full bead set for lookups) ----

export function makeIndex(beads: Bead[]): Map<string, Bead> {
  const m = new Map<string, Bead>();
  for (const b of beads) m.set(b.id, b);
  return m;
}

export function isBlocked(b: Bead, index: Map<string, Bead>): boolean {
  if (b.status === "blocked") return true;
  if (b.status !== "open") return false;
  return blockingDeps(b, index).length > 0;
}

/**
 * The unresolved things actually holding this bead up — for naming blockers on a
 * card, so it must not name something the user doesn't experience as a blocker.
 *
 * `parent-child` is excluded even though bd counts it in BLOCKING_DEP_TYPES for
 * ready-queue purposes: the edge points from a child to its epic, so including
 * it makes every blocked child report its own parent epic alongside the real
 * blocker ("blocked by <the epic it lives in>"), which is noise at best and
 * misdirection at worst. Hierarchy is shown as hierarchy elsewhere.
 *
 * Shared by isBlocked so the badge, Focus column, and blocker names agree.
 */
export function blockingDeps(b: Bead, index: Map<string, Bead>): string[] {
  return (b.dependencies ?? [])
    .filter(
      (d) =>
        d.type !== "parent-child" &&
        BLOCKING_DEP_TYPES.includes(d.type as never) &&
        (index.get(d.depends_on_id)?.status ?? "open") !== "closed",
    )
    .map((d) => d.depends_on_id);
}

/**
 * The bead's parent, whatever its type. Resolved from the parent-child
 * dependency EDGE — never `bead.parent`, which `bd export --json` omits, so an
 * edge lookup is the only one correct on board/list data as well as in the
 * drawer.
 *
 * Replaces the former `epicOf`, which returned the same thing but was named as
 * though the parent were always an epic — so a task-parented bead rendered a
 * chip labelled "epic" and clicked through to the Epics screen, which renders
 * epics only. Callers now branch on `parent.issue_type` themselves.
 */
export function parentOf(b: Bead, index: Map<string, Bead>): Bead | null {
  const d = (b.dependencies ?? []).find((x) => x.type === "parent-child");
  return d ? index.get(d.depends_on_id) ?? null : null;
}

/**
 * Children per parent id, built in ONE pass over all beads. Callers render
 * per-card counts from this rather than calling childrenOf() per card, which
 * would be an O(n²) scan on a large board.
 */
export function childrenCountMap(beads: Bead[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of beads) {
    for (const d of b.dependencies ?? []) {
      if (d.type === "parent-child") m.set(d.depends_on_id, (m.get(d.depends_on_id) ?? 0) + 1);
    }
  }
  return m;
}

export function childrenOf(epicId: string, beads: Bead[]): Bead[] {
  return beads.filter((b) =>
    (b.dependencies ?? []).some(
      (d) => d.type === "parent-child" && d.depends_on_id === epicId,
    ),
  );
}

export function epicProgress(
  epicId: string,
  beads: Bead[],
): { closed: number; total: number; pct: number } {
  const kids = childrenOf(epicId, beads);
  const total = kids.length;
  const closed = kids.filter((k) => k.status === "closed").length;
  return { closed, total, pct: total ? Math.round((closed / total) * 100) : 0 };
}

/**
 * A node of the Epics screen's nested epic tree (GH #40): one epic with its
 * direct children — nested epics and plain tasks alike.
 */
export type EpicTreeNode = {
  bead: Bead;
  children: EpicTreeNode[];
};

/** Roots and siblings share one order: open before closed, then priority, then id. */
function epicTreeOrder(a: Bead, b: Bead): number {
  return (
    Number(a.status === "closed") - Number(b.status === "closed") ||
    a.priority - b.priority ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Build the nested epic tree for the Epics screen (GH #40).
 *
 * Every epic appears exactly once: an epic whose parent is another epic hangs
 * off that parent instead of also rendering as its own top-level card, so a
 * four-level hierarchy reads as one tree rather than four unrelated cards.
 * Parent cycles cannot swallow epics — their members have no root above them,
 * so any epic the root walk does not reach is appended as an additional root.
 */
export function buildEpicTree(beads: Bead[]): EpicTreeNode[] {
  const byId = new Map<string, Bead>();
  for (const bead of beads) {
    if (!byId.has(bead.id)) byId.set(bead.id, bead);
  }

  const epicIds = new Set<string>();
  for (const bead of byId.values()) {
    if (bead.issue_type === "epic") epicIds.add(bead.id);
  }

  // One pass collects each epic's direct children — nested epics and plain
  // tasks alike — the same shape childrenCountMap uses. A task's own children
  // are not collected, so tasks stay leaves as on the flat screen.
  const childEdges = new Map<string, Bead[]>();
  for (const bead of byId.values()) {
    for (const dependency of bead.dependencies ?? []) {
      if (dependency.type !== "parent-child" || !epicIds.has(dependency.depends_on_id)) continue;
      const siblings = childEdges.get(dependency.depends_on_id);
      if (siblings) siblings.push(bead);
      else childEdges.set(dependency.depends_on_id, [bead]);
    }
  }

  // An epic parented by a non-epic (or by a bead bd export dropped) has no
  // epic above it, so it roots here rather than vanishing with its parent.
  const roots: Bead[] = [];
  for (const bead of byId.values()) {
    if (!epicIds.has(bead.id)) continue;
    const parent = parentOf(bead, byId);
    if (!parent || !epicIds.has(parent.id)) roots.push(bead);
  }
  roots.sort(epicTreeOrder);

  const visited = new Set<string>();
  const build = (bead: Bead): EpicTreeNode => {
    visited.add(bead.id);
    const children = (childEdges.get(bead.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .sort(epicTreeOrder);
    return { bead, children: children.map(build) };
  };

  const tree = roots.map(build);
  // Cycle members (A the parent of B while B is the parent of A) have no root
  // above them, so the walk above never reaches them. Append them as roots
  // rather than dropping epics the user can no longer see at all; the visited
  // guard keeps an epic that an earlier orphan already pulled in unique.
  const orphans = [...byId.values()]
    .filter((bead) => epicIds.has(bead.id))
    .sort(epicTreeOrder);
  for (const orphan of orphans) {
    if (visited.has(orphan.id)) continue;
    tree.push(build(orphan));
  }
  return tree;
}

/**
 * Apply the Epics screen's "hide closed" filter to a nested tree.
 *
 * A closed node is dropped and its still-open epic descendants are promoted to
 * the nearest visible ancestor, so hiding a closed epic cannot hide open work
 * beneath it. Tasks under a hidden epic go with it — on the flat screen they
 * were only reachable through the hidden card. `keepId` survives the filter: a
 * focused closed epic stays for the first render, until the focus effect turns
 * the filter off.
 */
export function filterEpicTreeClosed(nodes: EpicTreeNode[], keepId?: string): EpicTreeNode[] {
  const visible: EpicTreeNode[] = [];
  for (const node of nodes) {
    if (node.bead.status === "closed" && node.bead.id !== keepId) {
      for (const child of filterEpicTreeClosed(node.children, keepId)) {
        if (child.bead.issue_type === "epic") visible.push(child);
      }
    } else {
      visible.push({ ...node, children: filterEpicTreeClosed(node.children, keepId) });
    }
  }
  return visible;
}

/**
 * Epic ancestors of `beadId`, nearest first — the chain the Epics screen must
 * auto-expand so a focused nested epic is in the DOM to scroll to (GH #40).
 * Stops at the first non-epic parent and on malformed cycles.
 */
export function epicAncestorIds(beads: Bead[], beadId: string): string[] {
  const index = makeIndex(beads);
  const ancestors: string[] = [];
  const seen = new Set<string>([beadId]);
  let cursor = index.get(beadId);
  while (cursor) {
    const parent = parentOf(cursor, index);
    if (!parent || parent.issue_type !== "epic" || seen.has(parent.id)) break;
    ancestors.push(parent.id);
    seen.add(parent.id);
    cursor = parent;
  }
  return ancestors;
}

// ---- relative time ----

export function relTime(iso?: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const d = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 2592000) return `${Math.floor(d / 86400)}d ago`;
  return `${Math.floor(d / 2592000)}mo ago`;
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Full absolute timestamp, e.g. "Jun 24, 2026, 2:15 PM" — used as the hover
 *  title behind relative times like "3d ago" (bead hl2). */
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
