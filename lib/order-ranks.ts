/**
 * Sparse ranks for the manual board order kept in beads (lib/order-store.ts).
 *
 * Ranks are numbers in each bead's `scotty.rank` metadata, lowest first. New
 * ranks are integers RANK_STEP apart, so a card dropped between two others
 * takes a rank from the gap between theirs and is the only bead written. A
 * column is renumbered only when a gap has no integer left.
 *
 * No runtime imports, so the planner can be tested in plain Node.
 */

/** Gap between neighbouring new ranks. */
export const RANK_STEP = 1024;

/**
 * The rank writes that put `ids` (one column, top to bottom) in that order.
 *
 * `rank(id)` is a bead's current rank, or null when it has none. Unranked
 * beads sort after ranked ones, in `fallback` order (the board's: priority,
 * then list order). A trailing run of unranked beads that is already in
 * fallback order therefore stays unranked. Before it, the beads that are
 * already in rank order keep their ranks (the longest increasing run), and
 * only the others are written. Returns the new rank of each bead that changes.
 */
export function planRanks(
  ids: string[],
  rank: (id: string) => number | null,
  fallback: (id: string) => number,
): Map<string, number> {
  let end = ids.length;
  while (end > 0 && rank(ids[end - 1]) === null &&
    (end === ids.length || fallback(ids[end - 1]) < fallback(ids[end]))) end--;
  const head = ids.slice(0, end);

  const keep = longestIncreasing(head.map(rank));
  const next = new Map<string, number>();
  let i = 0;
  while (i < head.length) {
    if (keep.has(i)) { i++; continue; }
    let j = i;
    while (j < head.length && !keep.has(j)) j++;
    const lo = i > 0 ? rank(head[i - 1]) : null;
    const hi = j < head.length ? rank(head[j]) : null;
    const slots = between(lo, hi, j - i);
    if (!slots) return renumber(head, rank);
    for (let k = i; k < j; k++) next.set(head[k], slots[k - i]);
    i = j;
  }
  return next;
}

/** Indexes of one longest strictly increasing run of the non-null ranks. */
function longestIncreasing(ranks: (number | null)[]): Set<number> {
  const tails: number[] = [];
  const prev: number[] = new Array(ranks.length).fill(-1);
  ranks.forEach((r, i) => {
    if (r === null) return;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((ranks[tails[mid]] as number) < r) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  });
  const keep = new Set<number>();
  for (let i = tails.length ? tails[tails.length - 1] : -1; i !== -1; i = prev[i]) keep.add(i);
  return keep;
}

/** `count` increasing integers strictly between lo and hi (null: open end), or null if they don't fit. */
function between(lo: number | null, hi: number | null, count: number): number[] | null {
  if (lo === null && hi === null) return Array.from({ length: count }, (_, k) => k * RANK_STEP);
  if (lo === null) return Array.from({ length: count }, (_, k) => Math.floor(hi as number) - (count - k) * RANK_STEP);
  if (hi === null) return Array.from({ length: count }, (_, k) => Math.ceil(lo) + (k + 1) * RANK_STEP);
  const first = Math.floor(lo) + 1;
  const room = Math.ceil(hi) - 1 - first + 1;
  if (room < count) return null;
  return Array.from({ length: count }, (_, k) => first + Math.floor(((k + 1) * (room + 1)) / (count + 1)) - 1);
}

/** Every bead in `ids` at position × RANK_STEP; returns only the ranks that change. */
function renumber(ids: string[], rank: (id: string) => number | null): Map<string, number> {
  const next = new Map<string, number>();
  ids.forEach((id, i) => {
    if (rank(id) !== i * RANK_STEP) next.set(id, i * RANK_STEP);
  });
  return next;
}
