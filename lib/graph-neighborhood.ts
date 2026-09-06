import type { Bead } from "./schema";

/** Active blocking chains only; hierarchy and related links remain visible context. */
export function graphNeighborhood(beads: Bead[], visibleIds: Set<string>, focusId: string) {
  const present = new Map(beads.filter(b => visibleIds.has(b.id)).map(b => [b.id, b]));
  const upstream = new Map<string, string[]>();
  const downstream = new Map<string, string[]>();
  const edgeIds = new Set<string>();
  function link(map: Map<string, string[]>, from: string, to: string) {
    const targets = map.get(from);
    if (targets) targets.push(to);
    else map.set(from, [to]);
  }
  for (const bead of present.values()) {
    if (bead.status === "closed") continue;
    for (const dep of bead.dependencies ?? []) {
      if (!["blocks", "waits-for", "conditional-blocks"].includes(dep.type)) continue;
      const target = present.get(dep.depends_on_id);
      if (!target || target.status === "closed") continue;
      link(upstream, bead.id, target.id);
      link(downstream, target.id, bead.id);
      edgeIds.add(`${bead.id}->${target.id}:${dep.type}`);
    }
  }
  function walk(links: Map<string, string[]>) {
    const seen = new Set([focusId]);
    const pending = [focusId];
    while (pending.length) {
      for (const id of links.get(pending.pop()!) ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        pending.push(id);
      }
    }
    return seen;
  }
  const up = walk(upstream);
  const down = walk(downstream);
  return { all: new Set([...up, ...down]), up: up.size - 1, down: down.size - 1, edgeIds };
}
