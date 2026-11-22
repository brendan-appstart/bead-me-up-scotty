/**
 * Merge a reorder of the VISIBLE cards of a column back into the column's full
 * stored manual order.
 *
 * Filters, the archived toggle and the Done window hide some beads, so a drag
 * only ever sees a subset of the column. Writing that subset as the new order
 * would drop every hidden bead's rank. Instead, the reordered visible IDs fill
 * the slots the visible IDs occupied before, in their new order, and hidden IDs
 * keep their exact positions.
 *
 * Visible IDs that had no stored rank yet are appended (in their displayed
 * order) before slotting, which matches how unranked cards render: after the
 * ranked ones.
 */
export function mergeVisibleOrder(
  stored: readonly string[] | undefined,
  visibleBefore: readonly string[],
  visibleAfter: readonly string[],
): string[] {
  const visible = new Set(visibleBefore);
  const seen = new Set<string>();
  const base: string[] = [];
  for (const id of [...(stored ?? []), ...visibleBefore]) {
    if (seen.has(id)) continue;
    seen.add(id);
    base.push(id);
  }

  const queue = visibleAfter.filter((id) => visible.has(id));
  let next = 0;
  const out: string[] = [];
  for (const id of base) {
    if (!visible.has(id)) out.push(id);
    else if (next < queue.length) out.push(queue[next++]);
  }
  // Only reached if visibleAfter is not a permutation of visibleBefore.
  while (next < queue.length) out.push(queue[next++]);
  return [...new Set(out)];
}
