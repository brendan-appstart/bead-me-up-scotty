import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

const {
  __resetConfigCacheForTests,
  addFilterSet,
  ConfigError,
  deleteFilterSet,
  DEMO_PROJECT,
  getFilterSets,
  removeProject,
  renameFilterSet,
} = await import("@/lib/config");

import type { FilterSetSnapshot } from "@/lib/filter-sets";

const BOARD_SNAPSHOT: FilterSetSnapshot = {
  status: ["open"],
  type: ["task"],
  priority: [1],
  origin: ["human"],
  labels: ["bug"],
  assignee: ["ada"],
  epic: ["scotty-4t9"],
  search: "widget",
  archived: true,
};

const LIST_SNAPSHOT: FilterSetSnapshot = {
  status: [],
  type: [],
  priority: [],
  origin: [],
  labels: [],
  assignee: [],
  epic: ["scotty-4t9"],
  search: "",
  archived: false,
};

let tmpDir: string;
let prevXdg: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scotty-filter-sets-"));
  prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmpDir;
  __resetConfigCacheForTests();
});

afterEach(() => {
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
  __resetConfigCacheForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function configPath(): string {
  return path.join(tmpDir, "bead-me-up-scotty", "config.json");
}

test("addFilterSet round-trips through getFilterSets and on-disk config", () => {
  const sets = addFilterSet("proj-a", "Board view", BOARD_SNAPSHOT);
  expect(sets).toEqual([
    {
      id: expect.any(String),
      name: "Board view",
      snapshot: BOARD_SNAPSHOT,
    },
  ]);
  expect(getFilterSets("proj-a")).toEqual(sets);

  __resetConfigCacheForTests();
  expect(getFilterSets("proj-a")).toEqual(sets);
  expect(JSON.parse(fs.readFileSync(configPath(), "utf8")).filterSets).toEqual({
    "proj-a": sets,
  });
});

test("renameFilterSet updates the saved name", () => {
  const [created] = addFilterSet("proj-a", "Board view", BOARD_SNAPSHOT);
  const sets = renameFilterSet("proj-a", created.id, "Open bugs");
  expect(sets).toEqual([
    {
      id: created.id,
      name: "Open bugs",
      snapshot: BOARD_SNAPSHOT,
    },
  ]);
  expect(getFilterSets("proj-a")).toEqual(sets);
});

test("deleteFilterSet removes the named set", () => {
  const [created] = addFilterSet("proj-a", "Board view", BOARD_SNAPSHOT);
  expect(deleteFilterSet("proj-a", created.id)).toEqual([]);
  expect(getFilterSets("proj-a")).toEqual([]);
});

test("addFilterSet rejects duplicate names unless overwrite is set", () => {
  addFilterSet("proj-a", "Board view", BOARD_SNAPSHOT);

  expect(() => addFilterSet("proj-a", "Board view", LIST_SNAPSHOT)).toThrow(ConfigError);
  try {
    addFilterSet("proj-a", "Board view", LIST_SNAPSHOT);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).code).toBe("duplicate_filter_set");
  }

  const sets = addFilterSet("proj-a", "Board view", LIST_SNAPSHOT, { overwrite: true });
  expect(sets).toEqual([
    {
      id: expect.any(String),
      name: "Board view",
      snapshot: LIST_SNAPSHOT,
    },
  ]);
});

test("demo project keeps filter sets in memory without writing OS config", () => {
  addFilterSet(DEMO_PROJECT.id, "Demo set", BOARD_SNAPSHOT);
  expect(getFilterSets(DEMO_PROJECT.id)).toEqual([
    {
      id: expect.any(String),
      name: "Demo set",
      snapshot: BOARD_SNAPSHOT,
    },
  ]);
  expect(fs.existsSync(configPath())).toBe(false);
});

test("removeProject drops saved filter sets for that project", () => {
  addFilterSet("orphan-proj", "Saved", BOARD_SNAPSHOT);
  removeProject("orphan-proj");
  expect(getFilterSets("orphan-proj")).toEqual([]);
});
