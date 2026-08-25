/**
 * Candidate list for the dependency typeahead: match id/title, skip self
 * and beads already linked from the current one.
 */
export function filterDepCandidates<T extends { id: string; title: string }>(
  beads: readonly T[],
  query: string,
  options: { currentId: string; linkedIds: Iterable<string> },
): T[] {
  const q = query.trim().toLowerCase();
  const linked = new Set(options.linkedIds);
  return beads.filter((bead) => {
    if (bead.id === options.currentId) return false;
    if (linked.has(bead.id)) return false;
    if (!q) return true;
    return (
      bead.id.toLowerCase().includes(q) || bead.title.toLowerCase().includes(q)
    );
  });
}
