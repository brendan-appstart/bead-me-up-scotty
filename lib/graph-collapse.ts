import type { Bead } from "./schema";

export type GraphLink = {
  id: string;
  dependentId: string;
  prerequisiteId: string;
  type: string;
  originalIds?: string[];
};

export function graphLinkId(dependentId: string, prerequisiteId: string, type: string): string {
  return `${dependentId}->${prerequisiteId}:${type}`;
}

export function projectGraph(source: Bead[], foldedIds: ReadonlySet<string>) {
  const beads = new Map<string, Bead>();
  for (const bead of source) if (!beads.has(bead.id)) beads.set(bead.id, bead);

  const parents = new Map<string, string>();
  for (const bead of beads.values()) {
    let parent: string | undefined;
    for (const link of bead.dependencies ?? []) {
      const id = link.depends_on_id;
      if (link.type === "parent-child" && id !== bead.id && beads.has(id) && (parent === undefined || id < parent)) {
        parent = id;
      }
    }
    if (parent !== undefined) parents.set(bead.id, parent);
  }

  // A bead with multiple parents has one folding owner. For a cycle, make
  // its lowest id a root. Neither rule removes real visible hierarchy links.
  const checked = new Set<string>();
  for (const start of parents.keys()) {
    const path = new Set<string>();
    for (let id: string | undefined = start; id !== undefined && !checked.has(id); id = parents.get(id)) {
      if (path.has(id)) {
        let root = id;
        for (let member = parents.get(id)!; member !== id; member = parents.get(member)!) {
          if (member < root) root = member;
        }
        parents.delete(root);
        break;
      }
      path.add(id);
    }
    for (const id of path) checked.add(id);
  }

  const children = new Map<string, string[]>();
  for (const [child, parent] of parents) {
    const siblings = children.get(parent);
    if (siblings) siblings.push(child);
    else children.set(parent, [child]);
  }
  const pending = [...beads.keys()].filter((id) => !parents.has(id));
  const representative = new Map(pending.map((id) => [id, id]));
  const expandable = new Set<string>();
  const hiddenCounts = new Map<string, number>();
  for (let index = 0; index < pending.length; index += 1) {
    const id = pending[index];
    const rep = representative.get(id)!;
    if (id !== rep) hiddenCounts.set(rep, (hiddenCounts.get(rep) ?? 0) + 1);
    const descendants = children.get(id);
    if (!descendants) continue;
    if (id === rep) expandable.add(id);
    for (const child of descendants) {
      representative.set(child, id !== rep || foldedIds.has(id) ? rep : child);
      pending.push(child);
    }
  }

  const links: GraphLink[] = [];
  const seen = new Set<string>();
  const summaries = new Map<string, GraphLink & { originalIds: string[] }>();
  for (const bead of beads.values()) {
    const dependentId = representative.get(bead.id)!;
    for (const { depends_on_id, type } of bead.dependencies ?? []) {
      const prerequisiteId = representative.get(depends_on_id);
      if (prerequisiteId === undefined || dependentId === prerequisiteId) continue;
      const originalId = graphLinkId(bead.id, depends_on_id, type);
      if (seen.has(originalId)) continue;
      seen.add(originalId);
      if (dependentId === bead.id && prerequisiteId === depends_on_id) {
        links.push({ id: originalId, dependentId, prerequisiteId, type });
      } else if (type !== "parent-child") {
        const id = `summary:${JSON.stringify([dependentId, prerequisiteId, type])}`;
        const summary = summaries.get(id);
        if (summary) summary.originalIds.push(originalId);
        else summaries.set(id, { id, dependentId, prerequisiteId, type, originalIds: [originalId] });
      }
    }
  }
  for (const summary of summaries.values()) links.push(summary);
  return {
    visible: [...beads.values()].filter((bead) => representative.get(bead.id) === bead.id),
    representative,
    expandable,
    hiddenCounts,
    links,
  };
}
