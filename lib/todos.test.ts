import { expect, test } from "bun:test";
import { beadSchema } from "@/lib/schema";
import { isTodo, listOpenTodos } from "@/lib/todos";

const openTask = beadSchema.parse({
  id: "todo-open",
  title: "Buy milk",
  status: "open",
  issue_type: "task",
});

const closedTask = beadSchema.parse({
  id: "todo-closed",
  title: "Already bought milk",
  status: "closed",
  issue_type: "task",
});

const deferredTask = beadSchema.parse({
  id: "todo-deferred",
  title: "Maybe buy milk later",
  status: "deferred",
  issue_type: "task",
});

const inProgressTask = beadSchema.parse({
  id: "todo-wip",
  title: "Buying milk now",
  status: "in_progress",
  issue_type: "task",
});

const inProgressFeature = beadSchema.parse({
  id: "feat-wip",
  title: "Milk delivery pipeline",
  status: "in_progress",
  issue_type: "feature",
});

test("open task is a todo", () => {
  expect(isTodo(openTask)).toBe(true);
});

test("closed task is not a todo", () => {
  expect(isTodo(closedTask)).toBe(false);
});

test("deferred task is not a todo", () => {
  expect(isTodo(deferredTask)).toBe(false);
});

test("in_progress feature is not a todo", () => {
  expect(isTodo(inProgressFeature)).toBe(false);
});

test("in_progress task is a todo", () => {
  expect(isTodo(inProgressTask)).toBe(true);
});

test("listOpenTodos returns only open tasks from a mixed list", () => {
  const beads = [
    openTask,
    closedTask,
    deferredTask,
    inProgressFeature,
    inProgressTask,
  ];
  expect(listOpenTodos(beads).map((bead) => bead.id)).toEqual([
    "todo-open",
    "todo-wip",
  ]);
});
