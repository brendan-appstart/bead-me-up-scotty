import { graphLinkId } from "./graph-collapse";
import type { Bead } from "./schema";

export const ACTIVE_BLOCKING_LINK_TYPES = new Set(["blocks", "waits-for", "conditional-blocks"]);

/** Walk the original active blocking links, separately in each direction. */
export function graphNeighborhood(beads: Bead[], seeds: Iterable<string>) {
  const active = new Set(beads.filter((bead) => bead.status !== "closed").map((bead) => bead.id));
  const roots = new Set(seeds);
  const upstream = new Map<string, Array<{ to: string; id: string }>>();
  const downstream = new Map<string, Array<{ to: string; id: string }>>();
  function link(map: typeof upstream, from: string, to: string, id: string) {
    const targets = map.get(from);
    if (targets) targets.push({ to, id });
    else map.set(from, [{ to, id }]);
  }
  for (const bead of beads) {
    if (!active.has(bead.id)) continue;
    for (const dep of bead.dependencies ?? []) {
      const target = dep.depends_on_id;
      if (!ACTIVE_BLOCKING_LINK_TYPES.has(dep.type) || !active.has(target) || target === bead.id) continue;
      const id = graphLinkId(bead.id, target, dep.type);
      link(upstream, bead.id, target, id);
      link(downstream, target, bead.id, id);
    }
  }
  const edgeIds = new Set<string>();
  function walk(links: typeof upstream) {
    const seen = new Set(roots);
    const pending = [...roots];
    while (pending.length) {
      for (const { to, id } of links.get(pending.pop()!) ?? []) {
        edgeIds.add(id);
        if (!seen.has(to)) {
          seen.add(to);
          pending.push(to);
        }
      }
    }
    return seen;
  }
  const up = walk(upstream);
  const down = walk(downstream);
  return { all: new Set([...up, ...down]), up: up.size - roots.size, down: down.size - roots.size, edgeIds };
}
