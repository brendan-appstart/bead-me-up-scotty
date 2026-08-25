import { expect, test } from "bun:test";
import type { Bead } from "@/lib/schema";
import {
  emptyFilters,
  epicOptionsFrom,
  filtersFromSearchParams,
  matchesFilters,
  writeFiltersToSearchParams,
  type Filters,
} from "@/lib/filters";

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

function indexOf(...beads: Bead[]): Map<string, Bead> {
  return new Map(beads.map((b) => [b.id, b]));
}

test("a child of epic A matches epic:[A]", () => {
  const epicA = bead({ id: "epic-a", title: "Capture filters", issue_type: "epic" });
  const epicB = bead({ id: "epic-b", title: "Other epic", issue_type: "epic" });
  const childOfA = bead({
    id: "task-1",
    title: "Add epic facet",
    dependencies: [{ depends_on_id: "epic-a", type: "parent-child" }],
  });
  const childOfB = bead({
    id: "task-2",
    title: "Something else",
    dependencies: [{ depends_on_id: "epic-b", type: "parent-child" }],
  });
  const orphan = bead({ id: "task-3", title: "No parent" });
  const index = indexOf(epicA, epicB, childOfA, childOfB, orphan);
  const filters: Filters = { ...emptyFilters, epic: ["epic-a"] };

  expect(matchesFilters(childOfA, filters, [], index)).toBe(true);
  expect(matchesFilters(childOfB, filters, [], index)).toBe(false);
  expect(matchesFilters(orphan, filters, [], index)).toBe(false);
});

test("search matches a description-only hit", () => {
  const hit = bead({
    id: "task-1",
    title: "Unrelated title",
    description: "mentions the widget protocol",
  });
  const miss = bead({
    id: "task-2",
    title: "Also unrelated",
    description: "something else entirely",
  });
  const index = indexOf(hit, miss);
  const filters: Filters = { ...emptyFilters, search: "widget protocol" };

  expect(matchesFilters(hit, filters, [], index)).toBe(true);
  expect(matchesFilters(miss, filters, [], index)).toBe(false);
});

test("search matches a notes-only hit", () => {
  const hit = bead({
    id: "task-1",
    title: "Unrelated title",
    notes: "follow up with the release captain",
  });
  const miss = bead({
    id: "task-2",
    title: "Also unrelated",
    notes: "parking lot",
  });
  const index = indexOf(hit, miss);
  const filters: Filters = { ...emptyFilters, search: "release captain" };

  expect(matchesFilters(hit, filters, [], index)).toBe(true);
  expect(matchesFilters(miss, filters, [], index)).toBe(false);
});

test("epic query param round-trips through filter URL helpers", () => {
  const params = new URLSearchParams("epic=epic-a&epic=epic-b&view=board");
  const filters = filtersFromSearchParams(params);
  expect(filters.epic).toEqual(["epic-a", "epic-b"]);

  const out = new URLSearchParams("view=board&issue=x");
  writeFiltersToSearchParams(out, filters);
  expect(out.getAll("epic")).toEqual(["epic-a", "epic-b"]);
  expect(out.get("view")).toBe("board");
  expect(out.get("issue")).toBe("x");
});

test("epicOptionsFrom lists issue_type epic beads and is empty without any", () => {
  const epic = bead({ id: "epic-a", title: "Capture filters", issue_type: "epic" });
  const task = bead({ id: "task-1", title: "Not an epic" });
  expect(epicOptionsFrom([epic, task])).toEqual([{ value: "epic-a", label: "Capture filters" }]);
  expect(epicOptionsFrom([task])).toEqual([]);
});

test("epic multi-select is OR: a child of A or B matches epic:[A,B]", () => {
  const epicA = bead({ id: "epic-a", title: "A", issue_type: "epic" });
  const epicB = bead({ id: "epic-b", title: "B", issue_type: "epic" });
  const childOfA = bead({
    id: "task-1",
    title: "Child A",
    dependencies: [{ depends_on_id: "epic-a", type: "parent-child" }],
  });
  const childOfB = bead({
    id: "task-2",
    title: "Child B",
    dependencies: [{ depends_on_id: "epic-b", type: "parent-child" }],
  });
  const index = indexOf(epicA, epicB, childOfA, childOfB);
  const filters: Filters = { ...emptyFilters, epic: ["epic-a", "epic-b"] };

  expect(matchesFilters(childOfA, filters, [], index)).toBe(true);
  expect(matchesFilters(childOfB, filters, [], index)).toBe(true);
});
