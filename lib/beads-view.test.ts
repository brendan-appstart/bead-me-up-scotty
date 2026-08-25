import { expect, test } from "bun:test";
import type { Bead } from "@/lib/schema";
import { epicProgress } from "@/lib/beads-view";

function bead(partial: Partial<Bead> & Pick<Bead, "id" | "title">): Bead {
  return {
    description: "",
    notes: "",
    design: "",
    acceptance_criteria: "",
    status: "open",
    priority: 2,
    issue_type: "task",
    assignee: "",
    created_by: "",
    labels: [],
    dependencies: [],
    comments: [],
    ...partial,
  };
}

test("parent with 1 closed + 1 open child is 50% done", () => {
  const parent = bead({ id: "feat-1", title: "Parent feature", issue_type: "feature" });
  const closed = bead({
    id: "feat-1.1",
    title: "Done child",
    status: "closed",
    dependencies: [{ depends_on_id: "feat-1", type: "parent-child" }],
  });
  const open = bead({
    id: "feat-1.2",
    title: "Open child",
    dependencies: [{ depends_on_id: "feat-1", type: "parent-child" }],
  });
  const beads = [parent, closed, open];

  expect(epicProgress("feat-1", beads)).toEqual({ closed: 1, total: 2, pct: 50 });
});

test("parent with zero children reports no progress", () => {
  const parent = bead({ id: "task-1", title: "Leaf task" });
  const beads = [parent];

  expect(epicProgress("task-1", beads)).toEqual({ closed: 0, total: 0, pct: 0 });
});
