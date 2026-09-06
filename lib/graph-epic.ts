import { BLOCKING_DEP_TYPES, type Bead } from "./schema";

export type EpicGraphScope = {
  beads: Bead[];
  insideIds: Set<string>;
  outsideIds: Set<string>;
};

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

  const children = new Map<string, string[]>();
  for (const bead of byId.values()) {
    for (const dependency of bead.dependencies ?? []) {
      if (dependency.type !== "parent-child" || !byId.has(dependency.depends_on_id)) continue;
      const current = children.get(dependency.depends_on_id);
      if (current) current.push(bead.id);
      else children.set(dependency.depends_on_id, [bead.id]);
    }
  }

  const insideIds = new Set<string>();
  const pending: string[] = [];
  if (byId.has(epicId)) {
    insideIds.add(epicId);
    pending.push(epicId);
  }
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    for (const childId of children.get(pending[cursor]) ?? []) {
      if (insideIds.has(childId)) continue;
      insideIds.add(childId);
      pending.push(childId);
    }
  }

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
export function graphDependencyLayers(beads: Bead[]): Map<string, number> {
  const ids = [...new Set(beads.map((bead) => bead.id))].sort();
  const present = new Set(ids);
  const blocking = new Set<string>(BLOCKING_DEP_TYPES);
  const outgoing = new Map(ids.map((id) => [id, new Set<string>()]));
  const incoming = new Map(ids.map((id) => [id, new Set<string>()]));

  for (const bead of beads) {
    if (!present.has(bead.id)) continue;
    for (const dependency of bead.dependencies ?? []) {
      if (!blocking.has(dependency.type) || !present.has(dependency.depends_on_id)) continue;
      // Dependency records are dependent -> prerequisite; layout adjacency is
      // prerequisite -> dependent so increasing layers read left to right.
      outgoing.get(dependency.depends_on_id)!.add(bead.id);
      incoming.get(bead.id)!.add(dependency.depends_on_id);
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
