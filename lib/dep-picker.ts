/** Match IDs and titles while excluding self-links and existing outgoing links. */
export function filterDepCandidates<T extends { id: string; title: string }>(
  beads: readonly T[],
  query: string,
  options: { currentId: string; linkedIds: Iterable<string> },
): T[] {
  const q = query.trim().toLowerCase();
  const linked = new Set(options.linkedIds);
  return beads.filter(bead =>
    bead.id !== options.currentId && !linked.has(bead.id) &&
    (!q || bead.id.toLowerCase().includes(q) || bead.title.toLowerCase().includes(q)),
  ).sort((a, b) => {
    // Exact IDs first, then natural ID order, independent of export order.
    const exact = Number(b.id.toLowerCase() === q) - Number(a.id.toLowerCase() === q);
    return exact || a.id.localeCompare(b.id, "en", { numeric: true }) || a.title.localeCompare(b.title, "en");
  });
}
