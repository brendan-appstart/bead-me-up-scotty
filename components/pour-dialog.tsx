"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { usePourFormula } from "@/hooks/use-formulas";
import type { Formula, PourPhase, PourResult } from "@/lib/formulas";

const inputClass =
  "h-[38px] w-full rounded-[9px] border border-border bg-[var(--surface-2)] px-3 text-[13.5px] text-[var(--text)] outline-none focus:border-[var(--brand)]";
const selectClass =
  "h-[38px] w-full cursor-pointer rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-[13px] text-[var(--text)] outline-none";
const labelClass = "text-[12px] font-[550] text-[var(--text-2)]";

function filledVars(vars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(vars).filter(([, value]) => value !== ""));
}

function seedVars(formula: Formula): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [name, def] of Object.entries(formula.vars)) {
    next[name] = def.default ?? "";
  }
  return next;
}

function defaultPhase(formula: Formula): PourPhase {
  return formula.phase === "vapor" ? "wisp" : "pour";
}

function missingRequired(formula: Formula, vars: Record<string, string>): string[] {
  return Object.entries(formula.vars)
    .filter(([name, def]) => def.required && !vars[name])
    .map(([name]) => name);
}

export function PourDialog({
  open,
  formula,
  onOpenChange,
  onPoured,
}: {
  open: boolean;
  formula: Formula | null;
  onOpenChange: (open: boolean) => void;
  onPoured: (result: PourResult) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)] sm:max-w-lg"
      >
        {open && formula && (
          <PourForm
            key={formula.formula}
            formula={formula}
            onClose={() => onOpenChange(false)}
            onPoured={onPoured}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PourForm({
  formula,
  onClose,
  onPoured,
}: {
  formula: Formula;
  onClose: () => void;
  onPoured: (result: PourResult) => void;
}) {
  const { projectId } = useApp();
  const pour = usePourFormula(projectId);
  const [phase, setPhase] = React.useState<PourPhase>(() => defaultPhase(formula));
  const [vars, setVars] = React.useState(() => seedVars(formula));
  const [preview, setPreview] = React.useState<PourResult | null>(null);
  const missing = missingRequired(formula, vars);
  const varEntries = Object.entries(formula.vars);
  const previewing = pour.isPending && pour.variables?.dryRun;
  const writing = pour.isPending && !pour.variables?.dryRun;

  const setVar = (name: string, value: string) => {
    setVars((current) => ({ ...current, [name]: value }));
    setPreview(null);
  };

  const run = async (dryRun: boolean) => {
    const result = await pour.mutateAsync({
      name: formula.formula,
      vars: filledVars(vars),
      phase,
      dryRun,
    });
    if (dryRun) setPreview(result);
    else onPoured(result);
  };

  return (
    <>
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-[15px] font-[650]">
            {phase === "wisp" ? "Wisp" : "Pour"} {formula.formula}
          </DialogTitle>
          <DialogDescription className="mt-1 text-[12.5px] text-[var(--text-3)]">
            {phase === "wisp"
              ? "Ephemeral work that does not need an audit trail."
              : "Persistent work stored as beads, like any other epic."}
          </DialogDescription>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          aria-label="Close"
        >
          <Icon name="x" size={14} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <div>
          <div className={labelClass}>Phase</div>
          <div className="mt-1.5 flex overflow-hidden rounded-[8px] border border-border">
            {(["pour", "wisp"] as const).map((next) => (
              <button
                key={next}
                type="button"
                onClick={() => {
                  setPhase(next);
                  setPreview(null);
                }}
                className={`flex-1 px-3 py-[7px] text-[12.5px] font-[550] ${
                  phase === next
                    ? "bg-[var(--brand)] text-white"
                    : "bg-[var(--surface-2)] text-[var(--text-2)]"
                }`}
              >
                {next === "pour" ? "Pour · persistent" : "Wisp · ephemeral"}
              </button>
            ))}
          </div>
        </div>

        {varEntries.length > 0 && (
          <div className="flex flex-col gap-3">
            {varEntries.map(([name, def]) => (
              <label key={name} className="flex flex-col gap-1">
                <span className={labelClass}>
                  {name}
                  {def.required && <span className="text-[var(--brand)]"> *</span>}
                </span>
                {def.enum.length > 0 ? (
                  <select
                    className={selectClass}
                    value={vars[name] ?? ""}
                    onChange={(e) => setVar(name, e.target.value)}
                  >
                    <option value="">Select…</option>
                    {def.enum.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={inputClass}
                    value={vars[name] ?? ""}
                    onChange={(e) => setVar(name, e.target.value)}
                    placeholder={def.default ?? def.description}
                    required={def.required}
                  />
                )}
                {def.description && (
                  <span className="text-[11.5px] text-[var(--text-3)]">{def.description}</span>
                )}
              </label>
            ))}
          </div>
        )}

        {formula.steps.length > 0 && (
          <div>
            <div className={labelClass}>Steps</div>
            <ol className="mt-1.5 flex flex-col gap-1">
              {formula.steps.map((step, i) => (
                <li
                  key={step.id}
                  className="rounded-[8px] border border-border bg-[var(--surface-2)] px-3 py-[7px] text-[12.5px]"
                >
                  <span className="font-mono text-[11px] text-[var(--text-3)]">
                    {i + 1}. {step.id}
                  </span>
                  <div className="font-[550]">{step.title}</div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {preview && (
          <div className="rounded-[10px] border border-border bg-[var(--surface-2)] px-3 py-3">
            <div className="text-[12px] font-[650]">Dry-run preview</div>
            <p className="mt-1 text-[12.5px] text-[var(--text-2)]">
              No beads will be written.
              {preview.phase ? ` Phase: ${preview.phase}.` : ""}
              {` ${preview.created} bead${preview.created === 1 ? "" : "s"} would be created.`}
            </p>
            {formula.steps.length > 0 && (
              <p className="mt-1 text-[11.5px] text-[var(--text-3)]">
                Confirm to instantiate {formula.steps.length} step
                {formula.steps.length === 1 ? "" : "s"} as work.
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
        {missing.length > 0 && (
          <span className="mr-auto text-[11.5px] text-[var(--text-3)]">
            Required: {missing.join(", ")}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-lg border border-border px-3 text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={missing.length > 0 || pour.isPending}
          onClick={() => void run(true)}
          className="h-8 rounded-lg border border-border bg-[var(--surface-2)] px-3 text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-50"
        >
          {previewing ? "Previewing…" : "Dry-run preview"}
        </button>
        <button
          type="button"
          disabled={missing.length > 0 || pour.isPending}
          onClick={() => void run(false)}
          className="h-8 rounded-lg bg-[var(--brand)] px-3 text-[12.5px] font-[650] text-white disabled:opacity-50"
        >
          {writing ? "Writing…" : phase === "wisp" ? "Wisp" : "Pour"}
        </button>
      </footer>
    </>
  );
}
