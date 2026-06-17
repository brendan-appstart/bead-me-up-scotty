import type { Bead } from "./schema";
import { BLOCKING_DEP_TYPES } from "./schema";

/**
 * Pure view-model helpers, ported from the Claude Design export prototype.
 * Framework-agnostic so they can run on the server and the client.
 */

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
  return (b.dependencies ?? []).some(
    (d) =>
      d.type === "blocks" &&
      (index.get(d.depends_on_id)?.status ?? "open") !== "closed",
  );
}

export function blockingDeps(b: Bead, index: Map<string, Bead>): string[] {
  return (b.dependencies ?? [])
    .filter(
      (d) =>
        BLOCKING_DEP_TYPES.includes(d.type as never) &&
        (index.get(d.depends_on_id)?.status ?? "open") !== "closed",
    )
    .map((d) => d.depends_on_id);
}

export function epicOf(b: Bead, index: Map<string, Bead>): Bead | null {
  const d = (b.dependencies ?? []).find((x) => x.type === "parent-child");
  return d ? index.get(d.depends_on_id) ?? null : null;
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
