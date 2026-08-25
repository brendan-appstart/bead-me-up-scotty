import { z } from "zod";
import { unwrapEnvelope } from "./schema";

/** `bd mol pour` vs `bd mol wisp`. */
export const pourPhaseSchema = z.enum(["pour", "wisp"]);
export type PourPhase = z.infer<typeof pourPhaseSchema>;

export const pourFormulaInputSchema = z.object({
  name: z.string().min(1),
  vars: z.record(z.string(), z.string()).optional().default({}),
  phase: pourPhaseSchema,
  dryRun: z.boolean().optional().default(false),
});
export type PourFormulaInput = z.input<typeof pourFormulaInputSchema>;

/** Variable definition from `bd formula show --json` (`map[string]*VarDef`). */
export const formulaVarDefSchema = z.object({
  description: z.string().optional().default(""),
  default: z.string().nullable().optional(),
  required: z.boolean().optional().default(false),
  enum: z.array(z.string()).optional().default([]),
  pattern: z.string().optional().default(""),
  type: z.string().optional().default("string"),
});
export type FormulaVarDef = z.infer<typeof formulaVarDefSchema>;

const formulaStepSchema = z.object({
  id: z.string(),
  title: z.string(),
});

/** Full formula from `bd formula show --json`. */
export const formulaSchema = z.object({
  formula: z.string(),
  description: z.string().optional().default(""),
  version: z.coerce.number().optional().default(1),
  type: z.string(),
  vars: z.record(z.string(), formulaVarDefSchema).optional().default({}),
  steps: z.array(formulaStepSchema).optional().default([]),
  phase: z.string().optional().default(""),
  source: z.string().optional().default(""),
});
export type Formula = z.infer<typeof formulaSchema>;

/** Summary row from `bd formula list --json` (`FormulaListEntry`). */
export const formulaListEntrySchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional().default(""),
  source: z.string().optional().default(""),
  steps: z.coerce.number().optional().default(0),
  vars: z.coerce.number().optional().default(0),
});
export type FormulaListEntry = z.infer<typeof formulaListEntrySchema>;

export const formulaListSchema = z.array(formulaListEntrySchema);

/** Result of `bd mol pour|wisp --json` (InstantiateResult plus phase flags). */
export const pourResultSchema = z.object({
  new_epic_id: z.string().optional().default(""),
  created: z.coerce.number().optional().default(0),
  id_mapping: z.record(z.string(), z.string()).optional().default({}),
  attached: z.coerce.number().optional().default(0),
  phase: z.string().optional().default(""),
  dry_run: z.boolean().optional().default(false),
});
export type PourResult = z.infer<typeof pourResultSchema>;

/** argv for `bd mol pour|wisp <name> [--var key=value] [--dry-run]`. */
export function molArgv(input: PourFormulaInput): string[] {
  const parsed = pourFormulaInputSchema.parse(input);
  const args = ["mol", parsed.phase, parsed.name];
  for (const [key, value] of Object.entries(parsed.vars)) {
    args.push("--var", `${key}=${value}`);
  }
  if (parsed.dryRun) args.push("--dry-run");
  return args;
}

export function parseFormulaList(raw: unknown): FormulaListEntry[] {
  const data = unwrapEnvelope(raw);
  if (data == null) return [];
  return formulaListSchema.parse(data);
}

export function parseFormulaShow(raw: unknown): Formula {
  return formulaSchema.parse(unwrapEnvelope(raw));
}

export function parsePourResult(raw: unknown): PourResult {
  return pourResultSchema.parse(unwrapEnvelope(raw));
}

export function formulaToListEntry(formula: Formula): FormulaListEntry {
  return formulaListEntrySchema.parse({
    name: formula.formula,
    type: formula.type,
    description: formula.description,
    source: formula.source,
    steps: formula.steps.length,
    vars: Object.keys(formula.vars).length,
  });
}

/**
 * Reject pour/wisp vars that omit a formula's `required` variables.
 * Throws ZodError with message `Missing required variable: <name>`.
 */
export function assertRequiredVars(
  formula: Formula,
  vars: Record<string, string>,
): void {
  z.record(z.string(), z.string())
    .superRefine((provided, ctx) => {
      for (const [name, def] of Object.entries(formula.vars)) {
        if (!def.required) continue;
        const value = provided[name];
        if (value === undefined || value === "") {
          ctx.addIssue({
            code: "custom",
            path: ["vars", name],
            message: `Missing required variable: ${name}`,
          });
        }
      }
    })
    .parse(vars);
}

export const DEMO_FORMULAS: Formula[] = [
  formulaSchema.parse({
    formula: "mol-feature",
    description: "Standard feature workflow",
    version: 1,
    type: "workflow",
    phase: "liquid",
    source: "(demo)",
    vars: {
      name: { description: "Feature name", required: true },
    },
    steps: [
      { id: "design", title: "Design {{name}}" },
      { id: "implement", title: "Implement {{name}}" },
    ],
  }),
  formulaSchema.parse({
    formula: "mol-patrol",
    description: "Ephemeral health check",
    version: 1,
    type: "workflow",
    phase: "vapor",
    source: "(demo)",
    vars: {},
  }),
];
