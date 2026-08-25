import { expect, test } from "bun:test";
import type { Filters } from "@/lib/filters";
import { emptyFilters } from "@/lib/filters";
import { apply, equals, serialize } from "@/lib/filter-sets";

const populated: Filters = {
  status: ["open"],
  type: ["task"],
  priority: [1],
  origin: ["human"],
  labels: ["bug"],
  assignee: ["ada"],
  epic: ["scotty-4t9"],
  search: "widget",
};

test("serialize then apply reconstructs FilterBar query params", () => {
  const snapshot = serialize(populated, true);
  expect(snapshot).toEqual({
    status: ["open"],
    type: ["task"],
    priority: [1],
    origin: ["human"],
    labels: ["bug"],
    assignee: ["ada"],
    epic: ["scotty-4t9"],
    search: "widget",
    archived: true,
  });

  const params = new URLSearchParams("view=board");
  apply(params, snapshot);
  expect(params.toString()).toBe(
    "view=board&status=open&type=task&priority=1&origin=human&label=bug&assignee=ada&epic=scotty-4t9&q=widget&archived=1",
  );
});

test("empty facets are a valid named snapshot and clear filter query keys", () => {
  const snapshot = serialize(emptyFilters, false);
  expect(snapshot).toEqual({
    status: [],
    type: [],
    priority: [],
    origin: [],
    labels: [],
    assignee: [],
    epic: [],
    search: "",
    archived: false,
  });

  const params = new URLSearchParams(
    "view=list&status=open&epic=scotty-4t9&q=widget&archived=1",
  );
  apply(params, snapshot);
  expect(params.toString()).toBe("view=list");
});

test("apply writes epic and archived without a search query key", () => {
  const snapshot = serialize(
    { ...emptyFilters, epic: ["scotty-4t9"] },
    true,
  );
  expect(snapshot).toEqual({
    status: [],
    type: [],
    priority: [],
    origin: [],
    labels: [],
    assignee: [],
    epic: ["scotty-4t9"],
    search: "",
    archived: true,
  });

  const params = new URLSearchParams("q=stale&issue=x");
  apply(params, snapshot);
  expect(params.toString()).toBe("issue=x&epic=scotty-4t9&archived=1");
});

test("equals is true only when every snapshot facet matches", () => {
  const a = serialize(populated, true);
  expect(equals(a, serialize(populated, true))).toBe(true);
  expect(equals(a, serialize({ ...populated, status: ["closed"] }, true))).toBe(
    false,
  );
  expect(equals(a, serialize({ ...populated, type: ["bug"] }, true))).toBe(
    false,
  );
  expect(equals(a, serialize({ ...populated, priority: [2] }, true))).toBe(
    false,
  );
  expect(equals(a, serialize({ ...populated, origin: ["agent"] }, true))).toBe(
    false,
  );
  expect(equals(a, serialize({ ...populated, labels: ["feat"] }, true))).toBe(
    false,
  );
  expect(equals(a, serialize({ ...populated, assignee: ["bev"] }, true))).toBe(
    false,
  );
  expect(equals(a, serialize({ ...populated, epic: ["other"] }, true))).toBe(
    false,
  );
  expect(equals(a, serialize({ ...populated, search: "other" }, true))).toBe(
    false,
  );
  expect(equals(a, serialize(populated, false))).toBe(false);
});

test("apply ignores unknown snapshot keys", () => {
  const snapshot = {
    ...serialize(emptyFilters, false),
    status: ["open"],
    futureFacet: ["nope"],
  };
  const params = new URLSearchParams();
  apply(params, snapshot);
  expect(params.toString()).toBe("status=open");
});
