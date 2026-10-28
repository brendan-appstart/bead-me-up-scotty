import "server-only";
import type { Bead } from "./schema";
import type { BeadsStore } from "./store";
import { colOf } from "./board-columns";
import {
  getConfig,
  getColumnOrders as getLocalOrders,
  orderStoreOf,
  setColumnOrder as setLocalOrder,
} from "./config";
import { RANK_STEP, planRanks } from "./order-ranks";

/**
 * Where the manual board order lives. The "local" backend is the app-local
 * config.json (lib/config.ts). The "beads" backend keeps each bead's position
 * in its `scotty.rank` metadata (sparse ranks, see lib/order-ranks.ts), so
 * agents reading `bd list --json` see the order a person set. Chosen by the
 * `orderStore` setting.
 *
 * Only order writes (PUT /order) and switching the setting on write beads.
 * Reads never do, so the request guard and read-only mode cover every write.
 */
export const RANK_KEY = "scotty.rank";

function rankOf(bead: Bead | undefined): number | null {
  const v = bead?.metadata?.[RANK_KEY];
  // Accept a numeric string too, in case bd ever returns metadata values as text.
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// A reorder reads the beads, plans the ranks, then writes the changes. Two of
// those overlapping would interleave their writes, so each project's whole
// read -> plan -> write sequence (and the migration) runs one at a time.
const chains = new Map<string, Promise<unknown>>();
function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(projectId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => undefined);
  chains.set(projectId, tail);
  void tail.then(() => {
    if (chains.get(projectId) === tail) chains.delete(projectId);
  });
  return next;
}

/** How the Board orders unranked cards: by priority, then in list order. */
function fallbackOf(beads: Bead[]): (id: string) => number {
  const at = new Map(beads.map((b, i) => [b.id, b.priority * beads.length + i]));
  return (id) => at.get(id) ?? Number.POSITIVE_INFINITY;
}

/**
 * The order of each column that holds a rank: its ranked beads, lowest rank
 * first, then its unranked beads in the Board's fallback order. The list is
 * complete, so the Board and the List view, which break ties differently,
 * show the same order. A column with no rank is left out.
 */
function deriveOrders(beads: Bead[]): Record<string, string[]> {
  const index = new Map(beads.map((b) => [b.id, b]));
  const fallback = fallbackOf(beads);
  const byColumn = new Map<string, { id: string; rank: number | null }[]>();
  for (const bead of beads) {
    const col = colOf(bead, index);
    if (!col) continue;
    byColumn.set(col, [...(byColumn.get(col) ?? []), { id: bead.id, rank: rankOf(bead) }]);
  }
  const orders: Record<string, string[]> = {};
  for (const [col, items] of byColumn) {
    if (!items.some((i) => i.rank !== null)) continue;
    items.sort((a, b) => {
      if (a.rank !== null && b.rank !== null) return a.rank - b.rank || a.id.localeCompare(b.id);
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return fallback(a.id) - fallback(b.id);
    });
    orders[col] = items.map((i) => i.id);
  }
  return orders;
}

/**
 * The board's order: a column that holds a rank shows the ranks; one that holds
 * none yet shows the order saved in this app, until the copy below runs.
 */
function boardOrders(projectId: string, beads: Bead[]): Record<string, string[]> {
  return { ...getLocalOrders(projectId), ...deriveOrders(beads) };
}

async function writeRanks(store: BeadsStore, ranks: Map<string, number>, actor: string) {
  for (const [id, rank] of ranks) await store.setMetadata(id, { [RANK_KEY]: rank }, actor);
}

/**
 * Copy the order saved in this app into beads, for each column that holds no
 * rank yet. A column that already holds one keeps it, so the copy never
 * overwrites a rank and runs at most once per column. config.json is left as it
 * is, so switching back to local returns to that order. Call with the project
 * lock held; returns the beads as they are afterwards.
 */
async function copyLocalOrder(projectId: string, store: BeadsStore, actor: string): Promise<Bead[]> {
  const beads = await store.list();
  const local = getLocalOrders(projectId);
  if (!Object.keys(local).length) return beads;
  const ranked = deriveOrders(beads);
  const index = new Map(beads.map((b) => [b.id, b]));
  const ranks = new Map<string, number>();
  for (const [col, ids] of Object.entries(local)) {
    if (ranked[col]) continue;
    // Only the beads that are still in that column; a moved bead takes no rank from it.
    const present = ids.filter((id) => {
      const bead = index.get(id);
      return bead !== undefined && colOf(bead, index) === col;
    });
    present.forEach((id, i) => ranks.set(id, i * RANK_STEP));
  }
  if (!ranks.size) return beads;
  await writeRanks(store, ranks, actor);
  return store.list();
}

/**
 * Switching local → beads: copy every project's saved order across. Best effort
 * per project; one that cannot be reached is copied on its next order write.
 */
export async function copyAllLocalOrders(
  projects: { id: string; store: () => Promise<BeadsStore> }[],
  actor: string,
) {
  for (const p of projects) {
    try {
      const store = await p.store();
      await withProjectLock(p.id, () => copyLocalOrder(p.id, store, actor));
    } catch {
      /* copied on the next order write */
    }
  }
}

/** Column orders for a project. Never writes. */
export async function getColumnOrders(
  projectId: string,
  openStore: () => Promise<BeadsStore>,
): Promise<Record<string, string[]>> {
  // The local backend never reads beads, so it needs no store (or bd) at all.
  if (orderStoreOf(getConfig()) !== "beads") return getLocalOrders(projectId);
  const store = await openStore();
  return withProjectLock(projectId, async () => boardOrders(projectId, await store.list()));
}

/**
 * Put one column in the order `ids` (the column's cards as the board shows
 * them, top to bottom), then return all of the project's column orders. Writes
 * only the beads whose rank must change, usually just the moved one.
 */
export async function setColumnOrder(
  projectId: string,
  columnId: string,
  ids: string[],
  openStore: () => Promise<BeadsStore>,
  actor: string,
): Promise<Record<string, string[]>> {
  if (orderStoreOf(getConfig()) !== "beads") return setLocalOrder(projectId, columnId, ids);
  const store = await openStore();
  return withProjectLock(projectId, async () => {
    // Read the beads only now that the lock is held, so the plan is current.
    const beads = await copyLocalOrder(projectId, store, actor);
    const index = new Map(beads.map((b) => [b.id, b]));
    // Only the beads that are in this column now: one that moved to another
    // column since the Board drew it must not take a rank from this one.
    const inColumn = ids.filter((id) => {
      const bead = index.get(id);
      return bead !== undefined && colOf(bead, index) === columnId;
    });
    const ranks = planRanks(inColumn, (id) => rankOf(index.get(id)), fallbackOf(beads));
    if (!ranks.size) return boardOrders(projectId, beads);
    await writeRanks(store, ranks, actor);
    return boardOrders(projectId, await store.list());
  });
}
