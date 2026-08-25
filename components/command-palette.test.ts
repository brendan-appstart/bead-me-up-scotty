import { expect, test } from "bun:test";
import { VIEWS } from "@/lib/views";
import {
  PALETTE_ACTIONS,
  PALETTE_VIEWS,
  paletteFilterSetValue,
  palettePourValue,
  paletteViewsForProject,
} from "@/components/command-palette";

test("palette views cover every app view", () => {
  const keys = new Set(PALETTE_VIEWS.map((v) => v.key));
  for (const view of VIEWS) {
    expect(keys.has(view)).toBe(true);
  }
});

test("achievements is hidden unless gamification is on", () => {
  const without = paletteViewsForProject(undefined).map((v) => v.key);
  const withGame = paletteViewsForProject({ gamification: true }).map((v) => v.key);
  expect(without).not.toContain("achievements");
  expect(withGame).toContain("achievements");
});

test("palette root actions include new todo and create bead", () => {
  expect(PALETTE_ACTIONS.newTodo).toBe("new todo quick capture");
  expect(PALETTE_ACTIONS.createBead).toBe("create bead new");
});

test("filter set and pour commands are searchable by name", () => {
  expect(paletteFilterSetValue("Open tasks")).toBe("filter set apply Open tasks");
  expect(palettePourValue("ship-feature")).toBe("pour formula ship-feature");
});
