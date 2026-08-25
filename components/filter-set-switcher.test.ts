import { expect, test } from "bun:test";
import { emptyFilters } from "@/lib/filters";
import { serialize, type FilterSet } from "@/lib/filter-sets";
import {
  DEMO_FILTER_SETS,
  listedFilterSets,
  matchingFilterSet,
  promptedFilterSetName,
} from "@/components/filter-set-switcher";

const emptySnapshot = serialize(emptyFilters, false);

const openTasks: FilterSet = {
  id: "fs-open",
  name: "Open tasks",
  snapshot: serialize({ ...emptyFilters, status: ["open"], type: ["task"] }, false),
};

test("demo with no saved sets lists the canned Open tasks / In progress / Archived presets", () => {
  const listed = listedFilterSets("demo", []);
  expect(listed.map((set) => set.name)).toEqual([
    "Open tasks",
    "In progress",
    "Archived",
  ]);
  expect(listed).toEqual(DEMO_FILTER_SETS);
  expect(listed[0]?.snapshot).toEqual(
    serialize({ ...emptyFilters, status: ["open"], type: ["task"] }, false),
  );
  expect(listed[1]?.snapshot).toEqual(
    serialize({ ...emptyFilters, status: ["in_progress"] }, false),
  );
  expect(listed[2]?.snapshot).toEqual(serialize(emptyFilters, true));
});

test("saved sets replace canned demo presets; other projects stay empty until saved", () => {
  expect(listedFilterSets("demo", [openTasks])).toEqual([openTasks]);
  expect(listedFilterSets("proj-a", [])).toEqual([]);
  expect(listedFilterSets("proj-a", [openTasks])).toEqual([openTasks]);
});

test("matchingFilterSet is the URL snapshot equal set, used for the checkmark", () => {
  const inProgress: FilterSet = {
    id: "fs-wip",
    name: "In progress",
    snapshot: serialize({ ...emptyFilters, status: ["in_progress"] }, false),
  };
  const sets = [openTasks, inProgress];
  expect(matchingFilterSet(sets, openTasks.snapshot)?.id).toBe("fs-open");
  expect(matchingFilterSet(sets, inProgress.snapshot)?.id).toBe("fs-wip");
  expect(matchingFilterSet(sets, emptySnapshot)).toBeUndefined();
});

test("empty or cancelled name prompts are rejected even for empty filters", () => {
  expect(promptedFilterSetName("  Board bugs  ")).toBe("Board bugs");
  expect(promptedFilterSetName("")).toBeNull();
  expect(promptedFilterSetName("   ")).toBeNull();
  expect(promptedFilterSetName(null)).toBeNull();
});
