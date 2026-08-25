import { expect, test } from "bun:test";
import { ZodError } from "zod";
import {
  DEMO_FORMULAS,
  assertRequiredVars,
  formulaSchema,
  molArgv,
  parseFormulaList,
  parseFormulaShow,
} from "@/lib/formulas";

test("pour argv includes --var name=auth and --dry-run", () => {
  expect(
    molArgv({
      name: "mol-feature",
      vars: { name: "auth" },
      phase: "pour",
      dryRun: true,
    }),
  ).toEqual([
    "mol",
    "pour",
    "mol-feature",
    "--var",
    "name=auth",
    "--dry-run",
  ]);
});

test("wisp argv uses mol wisp and omits --dry-run when unset", () => {
  expect(
    molArgv({
      name: "beads-release",
      vars: { version: "1.0" },
      phase: "wisp",
    }),
  ).toEqual(["mol", "wisp", "beads-release", "--var", "version=1.0"]);
});

test("Zod rejects a missing required var with a stable error", () => {
  const formula = formulaSchema.parse({
    formula: "mol-feature",
    type: "workflow",
    version: 1,
    vars: { name: { required: true, description: "Feature name" } },
  });
  try {
    assertRequiredVars(formula, {});
    throw new Error("expected missing-var rejection");
  } catch (err) {
    expect(err).toBeInstanceOf(ZodError);
    expect((err as ZodError).issues[0]?.message).toBe(
      "Missing required variable: name",
    );
  }
});

test("required vars pass when provided", () => {
  const formula = formulaSchema.parse({
    formula: "mol-feature",
    type: "workflow",
    version: 1,
    vars: { name: { required: true } },
  });
  expect(() => assertRequiredVars(formula, { name: "auth" })).not.toThrow();
});

test("parseFormulaList reads a bd formula list --json envelope", () => {
  const entries = parseFormulaList({
    schema_version: 1,
    data: [
      {
        name: "mol-feature",
        type: "workflow",
        description: "Standard feature workflow",
        source: "/tmp/mol-feature.formula.toml",
        steps: 2,
        vars: 1,
      },
    ],
  });
  expect(entries).toEqual([
    {
      name: "mol-feature",
      type: "workflow",
      description: "Standard feature workflow",
      source: "/tmp/mol-feature.formula.toml",
      steps: 2,
      vars: 1,
    },
  ]);
});

test("parseFormulaList treats a null envelope as an empty catalog", () => {
  expect(parseFormulaList({ schema_version: 1, data: null })).toEqual([]);
});

test("parseFormulaShow reads a bd formula show --json envelope", () => {
  const formula = parseFormulaShow({
    schema_version: 1,
    data: {
      formula: "mol-feature",
      description: "Standard feature workflow",
      version: 1,
      type: "workflow",
      vars: { name: { description: "Feature name", required: true } },
    },
  });
  expect(formula.formula).toBe("mol-feature");
  expect(formula.vars.name?.required).toBe(true);
});

test("demo fixtures include a formula with a required variable", () => {
  const withVar = DEMO_FORMULAS.find((formula) =>
    Object.values(formula.vars).some((def) => def.required),
  );
  expect(withVar?.formula).toBe("mol-feature");
  expect(withVar?.vars.name?.required).toBe(true);
});
