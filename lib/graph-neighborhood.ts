import { graphLinkId } from "./graph-collapse";
import type { Bead } from "./schema";

export const ACTIVE_BLOCKING_LINK_TYPES = new Set(["blocks", "waits-for", "conditional-blocks"]);

function isActiveBlockingLink(type: string, from: Bead, to: Bead) {
  return ACTIVE_BLOCKING_LINK_TYPES.has(type) && from.status !== "closed" && to.status !== "closed";
}

export function* graphActiveBlockingLinks(beads: Bead[]) {
  const byId = new Map(beads.map((bead) => [bead.id, bead]));
  for (const bead of beads) {
    for (const { depends_on_id: target, type } of bead.dependencies ?? []) {
      const prerequisite = byId.get(target);
      if (target !== bead.id && prerequisite && isActiveBlockingLink(type, bead, prerequisite)) {
        yield { id: graphLinkId(bead.id, target, type), dependent: bead.id, prerequisite: target };
      }
    }
  }
}

export function graphDirectRelationships(beads: Bead[], roots: ReadonlySet<string>) {
  const byId = new Map(beads.map((bead) => [bead.id, bead]));
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  for (const bead of beads) {
    for (const { depends_on_id: target, type } of bead.dependencies ?? []) {
      if (type === "parent-child" || target === bead.id || (!roots.has(bead.id) && !roots.has(target))) continue;
      const prerequisite = byId.get(target);
      if (!prerequisite || isActiveBlockingLink(type, bead, prerequisite)) continue;
      nodeIds.add(bead.id);
      nodeIds.add(target);
      edgeIds.add(graphLinkId(bead.id, target, type));
    }
  }
  return { nodeIds, edgeIds };
}

/** Walk the original active blocking links, separately in each direction. */
export function graphNeighborhood(beads: Bead[], seeds: Iterable<string>) {
  const roots = new Set(seeds);
  const upstream = new Map<string, Array<{ to: string; id: string }>>();
  const downstream = new Map<string, Array<{ to: string; id: string }>>();
  function link(map: typeof upstream, from: string, to: string, id: string) {
    const targets = map.get(from);
    if (targets) targets.push({ to, id });
    else map.set(from, [{ to, id }]);
  }
  for (const { id, dependent, prerequisite } of graphActiveBlockingLinks(beads)) {
    link(upstream, dependent, prerequisite, id);
    link(downstream, prerequisite, dependent, id);
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
