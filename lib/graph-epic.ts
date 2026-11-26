import type { GraphLink } from "./graph-collapse";
import { BLOCKING_DEP_TYPES, type Bead } from "./schema";

export type EpicGraphScope = {
  beads: Bead[];
  insideIds: Set<string>;
  outsideIds: Set<string>;
};

/** Return the root and its recursive descendants in the supplied hierarchy. */
export function graphSubtreeIds(beads: Iterable<Bead>, rootId: string): Set<string> {
  const seen = new Set<string>();
  const children = new Map<string, string[]>();
  for (const bead of beads) {
    if (seen.has(bead.id)) continue;
    seen.add(bead.id);
    for (const dependency of bead.dependencies ?? []) {
      if (dependency.type !== "parent-child") continue;
      const current = children.get(dependency.depends_on_id);
      if (current) current.push(bead.id);
      else children.set(dependency.depends_on_id, [bead.id]);
    }
  }

  if (!seen.has(rootId)) return new Set();
  const ids = new Set([rootId]);
  const pending = [rootId];
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    for (const childId of children.get(pending[cursor]) ?? []) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      pending.push(childId);
    }
  }
  return ids;
}

export function graphEpicPaths(beads: Bead[], rootId: string): Map<string, Set<string>> {
  const byId = new Map<string, Bead>();
  for (const bead of beads) if (!byId.has(bead.id)) byId.set(bead.id, bead);

  const candidates = new Map<string, Set<string>>();
  const seen = new Set([rootId]);
  const pending = [rootId];
  const epics: string[] = [];
  for (let i = 0; i < pending.length; i++) {
    const childId = pending[i];
    for (const { depends_on_id: parentId, type } of byId.get(childId)?.dependencies ?? []) {
      if (type !== "parent-child" || parentId === rootId || parentId === childId) continue;
      const parent = byId.get(parentId);
      if (!parent) continue;
      let children = candidates.get(parentId);
      if (!children) candidates.set(parentId, children = new Set());
      children.add(childId);
      if (seen.has(parentId)) continue;
      seen.add(parentId);
      (parent.issue_type === "epic" ? epics : pending).push(parentId);
    }
  }

  // Keep only branches that reach an epic in the current graph scope.
  const paths = new Map<string, Set<string>>();
  for (let i = 0; i < epics.length; i++) {
    const parentId = epics[i];
    const children = candidates.get(parentId);
    if (!children || paths.has(parentId)) continue;
    paths.set(parentId, children);
    for (const childId of children) epics.push(childId);
  }
  return paths;
}

/**
 * Select an epic, every recursive parent-child descendant, and one hop of
 * external dependency context. Input order is retained and duplicate ids are
 * collapsed, which keeps the result deterministic even with malformed cycles.
 */
export function buildEpicGraphScope(beads: Bead[], epicId: string): EpicGraphScope {
  const byId = new Map<string, Bead>();
  for (const bead of beads) {
    if (!byId.has(bead.id)) byId.set(bead.id, bead);
  }

  const insideIds = graphSubtreeIds(byId.values(), epicId);
  const outsideIds = new Set<string>();
  for (const bead of byId.values()) {
    for (const dependency of bead.dependencies ?? []) {
      if (!byId.has(dependency.depends_on_id)) continue;
      if (insideIds.has(bead.id) && !insideIds.has(dependency.depends_on_id)) {
        outsideIds.add(dependency.depends_on_id);
      }
      if (!insideIds.has(bead.id) && insideIds.has(dependency.depends_on_id)) {
        outsideIds.add(bead.id);
      }
    }
  }

  const visibleIds = new Set([...insideIds, ...outsideIds]);
  return {
    beads: [...byId.values()].filter((bead) => visibleIds.has(bead.id)),
    insideIds,
    outsideIds,
  };
}

/**
 * Assign deterministic left-to-right layers from prerequisite to dependent.
 * Strongly connected components share a layer, so dependency or hierarchy
 * cycles cannot recurse forever or push a member to the wrong side of itself.
 */
export function graphDependencyLayers(beads: Bead[], links?: readonly GraphLink[]): Map<string, number> {
  const ids = [...new Set(beads.map((bead) => bead.id))].sort();
  const blocking = new Set<string>(BLOCKING_DEP_TYPES);
  const outgoing = new Map(ids.map((id) => [id, new Set<string>()]));
  const incoming = new Map(ids.map((id) => [id, new Set<string>()]));

  const add = (dependent: string, prerequisite: string, type: string) => {
    if (!blocking.has(type)) return;
    const targets = outgoing.get(prerequisite);
    const sources = incoming.get(dependent);
    if (!targets || !sources) return;
    // Layout runs prerequisite -> dependent so layers read left to right.
    targets.add(dependent);
    sources.add(prerequisite);
  };
  if (links) {
    for (const link of links) add(link.dependentId, link.prerequisiteId, link.type);
  } else {
    for (const bead of beads) {
      for (const dep of bead.dependencies ?? []) add(bead.id, dep.depends_on_id, dep.type);
    }
  }

  // Iterative Kosaraju avoids call-stack failure on deep real-world graphs.
  const visited = new Set<string>();
  const finishOrder: string[] = [];
  for (const start of ids) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack: Array<{ id: string; next: number; neighbors: string[] }> = [
      { id: start, next: 0, neighbors: [...outgoing.get(start)!].sort() },
    ];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.next < frame.neighbors.length) {
        const next = frame.neighbors[frame.next++];
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push({ id: next, next: 0, neighbors: [...outgoing.get(next)!].sort() });
      } else {
        finishOrder.push(frame.id);
        stack.pop();
      }
    }
  }

  const componentOf = new Map<string, number>();
  const components: string[][] = [];
  for (let i = finishOrder.length - 1; i >= 0; i -= 1) {
    const start = finishOrder[i];
    if (componentOf.has(start)) continue;
    const componentId = components.length;
    const members: string[] = [];
    const stack = [start];
    componentOf.set(start, componentId);
    while (stack.length) {
      const id = stack.pop()!;
      members.push(id);
      for (const previous of [...incoming.get(id)!].sort().reverse()) {
        if (componentOf.has(previous)) continue;
        componentOf.set(previous, componentId);
        stack.push(previous);
      }
    }
    members.sort();
    components.push(members);
  }

  const componentEdges = new Map<number, Set<number>>();
  const indegree = new Array(components.length).fill(0) as number[];
  const componentLayers = new Array(components.length).fill(0) as number[];
  for (let i = 0; i < components.length; i += 1) componentEdges.set(i, new Set());
  for (const [from, targets] of outgoing) {
    const fromComponent = componentOf.get(from)!;
    for (const target of targets) {
      const toComponent = componentOf.get(target)!;
      if (fromComponent === toComponent || componentEdges.get(fromComponent)!.has(toComponent)) continue;
      componentEdges.get(fromComponent)!.add(toComponent);
      indegree[toComponent] += 1;
    }
  }

  const componentKey = (id: number) => components[id][0] ?? "";
  const ready = indegree
    .map((degree, id) => ({ degree, id }))
    .filter(({ degree }) => degree === 0)
    .map(({ id }) => id)
    .sort((a, b) => componentKey(a).localeCompare(componentKey(b)));
  while (ready.length) {
    const component = ready.shift()!;
    for (const target of [...componentEdges.get(component)!].sort((a, b) =>
      componentKey(a).localeCompare(componentKey(b)),
    )) {
      componentLayers[target] = Math.max(componentLayers[target], componentLayers[component] + 1);
      indegree[target] -= 1;
      if (indegree[target] === 0) {
        ready.push(target);
        ready.sort((a, b) => componentKey(a).localeCompare(componentKey(b)));
      }
    }
  }

  return new Map(ids.map((id) => [id, componentLayers[componentOf.get(id)!]]));
}
