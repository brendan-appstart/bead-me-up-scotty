import type { Bead } from "./schema";
import { blockKind, isBlocked, type BlockKind } from "./beads-view";

/**
 * The board's column model — shared by the Board (Kanban) and List views so they
 * agree on which column a bead belongs to and the column ordering used for the
 * manual run-order. Column order here defines left-to-right order on the Board
 * and top-to-bottom order in the List.
 *
 * Two layouts. "standard" is the board as it has always been. "waiting" is
 * opt-in (Settings → Board, or SCOTTY_WAITING_COLUMN=1 as the launch default):
 * work that has not started sits on the left, so Waiting holds parked
 * (deferred) beads and open beads that wait on other work, such as an agent's
 * later plan steps, and Blocked holds what waits on a person, before In
 * Progress. Waiting keeps the id "backlog", because saved orders and
 * `scotty.rank` are keyed by column id, so switching needs no migration.
 */
export type ColumnLayout = "standard" | "waiting";

/** A stored or requested layout, or undefined when it names no layout. */
export function parseColumnLayout(value: unknown): ColumnLayout | undefined {
  return value === "standard" || value === "waiting" ? value : undefined;
}

/** What a column's test reads about a bead, besides the bead itself. */
export interface ColumnContext {
  /** isBlocked(): status blocked, or open with an open blocking dependency. */
  blocked: boolean;
  /** blockKind(): what holds the bead up; the Waiting layout splits on it. */
  kind: BlockKind;
}

export function columnContext(bead: Bead, index: Map<string, Bead>): ColumnContext {
  return { blocked: isBlocked(bead, index), kind: blockKind(bead, index) };
}

export interface BoardColumn {
  id: string;
  name: string;
  color: string;
  cmd: string;
  /** A longer description of the column's rule, shown on hover over `cmd`. */
  hint?: string;
  droppable: boolean;
  /** The bd status a drop into this column sets (undefined = not a real status). */
  status?: string;
  test: (b: Bead, ctx: ColumnContext) => boolean;
}

/** The standard layout, also the default. */
export const BOARD_COLUMNS: BoardColumn[] = [
  { id: "backlog", name: "Backlog", color: "#64748b", cmd: "deferred", droppable: true, status: "deferred", test: (b) => b.status === "deferred" },
  { id: "ready", name: "Ready", color: "#3b82f6", cmd: "bd ready", droppable: true, status: "open", test: (b, { blocked }) => b.status === "open" && !blocked },
  { id: "in_progress", name: "In Progress", color: "#d97706", cmd: "in_progress", droppable: true, status: "in_progress", test: (b) => b.status === "in_progress" || b.status === "hooked" },
  { id: "blocked", name: "Blocked", color: "#ef4444", cmd: "bd blocked", droppable: false, test: (b, { blocked }) => blocked && b.status !== "deferred" && b.status !== "closed" },
  { id: "done", name: "Done", color: "#16a34a", cmd: "closed", droppable: true, status: "closed", test: (b) => b.status === "closed" },
];

/** The opt-in Waiting layout. */
export const WAITING_COLUMNS: BoardColumn[] = [
  { id: "backlog", name: "Waiting", color: "#64748b", cmd: "waits on work, or parked", hint: "Not started: waits on other work, or parked (deferred).", droppable: true, status: "deferred", test: (b, { kind }) => b.status === "deferred" || (b.status === "open" && kind === "work") },
  { id: "ready", name: "Ready", color: "#3b82f6", cmd: "bd ready", droppable: true, status: "open", test: (b, { kind }) => b.status === "open" && kind === "none" },
  { id: "blocked", name: "Blocked", color: "#ef4444", cmd: "waits on a person", hint: "Waits on a person: a bead with the human label, or a human gate, that you can act on now (not deferred, not itself blocked). Or the status is blocked.", droppable: false, test: (b, { kind }) => b.status === "blocked" || (b.status === "open" && kind === "gate") },
  { id: "in_progress", name: "In Progress", color: "#d97706", cmd: "in_progress", droppable: true, status: "in_progress", test: (b) => b.status === "in_progress" || b.status === "hooked" },
  { id: "done", name: "Done", color: "#16a34a", cmd: "closed", droppable: true, status: "closed", test: (b) => b.status === "closed" },
];

export function boardColumns(layout: ColumnLayout = "standard"): BoardColumn[] {
  return layout === "waiting" ? WAITING_COLUMNS : BOARD_COLUMNS;
}

/** The standard layout's column order. */
export const COLUMN_ORDER: string[] = BOARD_COLUMNS.map((c) => c.id);

export function columnOrder(layout: ColumnLayout = "standard"): string[] {
  return boardColumns(layout).map((c) => c.id);
}

/** Which board column a bead belongs to (first matching test), or null. */
export function colOf(bead: Bead, index: Map<string, Bead>, layout: ColumnLayout = "standard"): string | null {
  const ctx = columnContext(bead, index);
  for (const c of boardColumns(layout)) if (c.test(bead, ctx)) return c.id;
  return null;
}

/**
 * A drop sets the target column's status, and the card then sits where the
 * layout's rules put it. In the Waiting layout that can be another column: a
 * deferred card that still waits on something, dropped on Ready, becomes open
 * but stays out of Ready. Then this says where it went and why, so the drop
 * has a visible result. Null when the card lands where it was dropped, and
 * always in the standard layout, which is unchanged.
 */
export function dropNotice(
  bead: Bead,
  targetId: string,
  index: Map<string, Bead>,
  layout: ColumnLayout,
): { title: string; description: string } | null {
  if (layout !== "waiting") return null;
  const columns = boardColumns(layout);
  const target = columns.find((c) => c.id === targetId);
  if (!target?.droppable || !target.status) return null;
  const landing = colOf({ ...bead, status: target.status }, index, layout);
  if (!landing || landing === targetId) return null;
  const name = columns.find((c) => c.id === landing)?.name ?? landing;
  const why = blockKind(bead, index) === "gate" ? "waits on a person" : "waits on other work";
  const verb = landing === colOf(bead, index, layout) ? "stays" : "shows";
  return { title: `${bead.id} is now ${target.status}`, description: `It ${why}, so it ${verb} in ${name}.` };
}

export type BoardSortMode = "priority" | "updated" | "manual";

function updatedTime(card: Bead): number {
  const parsed = Date.parse(card.updated_at || card.created_at || "");
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function byUpdatedThenPriority(left: Bead, right: Bead): number {
  const updatedDiff = updatedTime(right) - updatedTime(left);
  return updatedDiff || left.priority - right.priority || left.id.localeCompare(right.id);
}

function byPriorityThenUpdated(first: Bead, second: Bead): number {
  return first.priority - second.priority || byUpdatedThenPriority(first, second);
}

/** Sort cards according to the board's explicit display mode. */
export function sortBoardCards(
  cards: Bead[], mode: BoardSortMode, order?: string[],
): Bead[] {
  const rank = new Map((order ?? []).map((id, i) => [id, i]));

  return [...cards].sort((cardA, cardB) => {
    if (mode === "updated") return byUpdatedThenPriority(cardA, cardB);
    if (mode === "priority") return byPriorityThenUpdated(cardA, cardB);

    const rankA = rank.get(cardA.id) ?? Number.POSITIVE_INFINITY;
    const rankB = rank.get(cardB.id) ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) return rankA - rankB;
    return cardA.priority - cardB.priority;
  });
}

/** Preserve saved manual order, falling back to priority for unranked cards. */
export function sortByOrder(cards: Bead[], order?: string[]): Bead[] {
  return sortBoardCards(cards, "manual", order);
}
