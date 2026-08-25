import { expect, test } from "bun:test";
import { beadSchema } from "@/lib/schema";
import {
  assign,
  attachParent,
  deferArgv,
  isTodo,
  listOpenTodos,
  promoteType,
  raisePriority,
} from "@/lib/todos";

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

test("promoteType('feature') returns issue_type patch", () => {
  expect(promoteType("feature")).toEqual({ issue_type: "feature" });
});

test("raisePriority(1) returns priority patch", () => {
  expect(raisePriority(1)).toEqual({ priority: 1 });
});

test("attachParent('bd-epic') returns parent patch", () => {
  expect(attachParent("bd-epic")).toEqual({ parent: "bd-epic" });
});

test("assign('dana') returns assignee patch", () => {
  expect(assign("dana")).toEqual({ assignee: "dana" });
});

test("deferArgv includes --until and the snooze phrase", () => {
  expect(deferArgv("bd-abc", "tomorrow")).toEqual([
    "defer",
    "bd-abc",
    "--until",
    "tomorrow",
  ]);
});

test("deferArgv appends --reason when given", () => {
  expect(deferArgv("bd-abc", "+1h", "waiting on API access")).toEqual([
    "defer",
    "bd-abc",
    "--until",
    "+1h",
    "--reason",
    "waiting on API access",
  ]);
});
