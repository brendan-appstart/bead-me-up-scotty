import { expect, test } from "bun:test";
import { updateInputSchema } from "@/lib/schema";

test("UpdateInput accepts empty assignee and notes/design/acceptance_criteria", () => {
  const parsed = updateInputSchema.parse({
    assignee: "",
    notes: "ship notes",
    design: "the design",
    acceptance_criteria: "must pass CI",
  });
  expect(parsed.assignee).toBe("");
  expect(parsed.notes).toBe("ship notes");
  expect(parsed.design).toBe("the design");
  expect(parsed.acceptance_criteria).toBe("must pass CI");
});

test("UpdateInput omitted long fields stay absent so a partial patch cannot wipe them", () => {
  const parsed = updateInputSchema.parse({ title: "keep the rest" });
  expect(parsed).toEqual({ title: "keep the rest" });
});
