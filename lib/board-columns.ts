import type { Bead } from "./schema";
import { isBlocked } from "./beads-view";

/**
 * The board's column model — shared by the Board (Kanban) and List views so they
 * agree on which column a bead belongs to and the column ordering used for the
 * manual run-order. Column order here defines top-to-bottom order in the List.
 */
export interface BoardColumn {
  id: string;
  name: string;
  color: string;
  cmd: string;
  droppable: boolean;
  /** The bd status a drop into this column sets (undefined = not a real status). */
  status?: string;
  test: (b: Bead, blocked: boolean) => boolean;
}

export const BOARD_COLUMNS: BoardColumn[] = [
  { id: "backlog", name: "Backlog", color: "#64748b", cmd: "deferred", droppable: true, status: "deferred", test: (b) => b.status === "deferred" },
  { id: "ready", name: "Ready", color: "#3b82f6", cmd: "bd ready", droppable: true, status: "open", test: (b, blocked) => b.status === "open" && !blocked },
  { id: "in_progress", name: "In Progress", color: "#d97706", cmd: "in_progress", droppable: true, status: "in_progress", test: (b) => b.status === "in_progress" || b.status === "hooked" },
  { id: "blocked", name: "Blocked", color: "#ef4444", cmd: "bd blocked", droppable: false, test: (b, blocked) => blocked && b.status !== "deferred" && b.status !== "closed" },
  { id: "done", name: "Done", color: "#16a34a", cmd: "closed", droppable: true, status: "closed", test: (b) => b.status === "closed" },
];

export const COLUMN_ORDER: string[] = BOARD_COLUMNS.map((c) => c.id);

/** Which board column a bead belongs to (first matching test), or null. */
export function colOf(b: Bead, index: Map<string, Bead>): string | null {
  const blocked = isBlocked(b, index);
  for (const c of BOARD_COLUMNS) if (c.test(b, blocked)) return c.id;
  return null;
}

/** Sort by saved manual order (rank), falling back to priority. */
export function sortByOrder(cards: Bead[], order?: string[]): Bead[] {
  const rank = new Map((order ?? []).map((id, i) => [id, i] as const));
  return [...cards].sort((a, b) => {
    const ra = rank.has(a.id) ? (rank.get(a.id) as number) : Number.POSITIVE_INFINITY;
    const rb = rank.has(b.id) ? (rank.get(b.id) as number) : Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return a.priority - b.priority;
  });
}
