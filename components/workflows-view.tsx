"use client";
import * as React from "react";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { PourDialog } from "@/components/pour-dialog";
import { useFormula, useFormulas } from "@/hooks/use-formulas";
import type { Formula, FormulaListEntry, PourResult } from "@/lib/formulas";

const SEARCH_PATHS = [
  "<project>/.beads/formulas/ (active project)",
  "<checkout>/.beads/formulas/ (repo-local)",
  "~/.beads/formulas/ (user)",
  "$GT_ROOT/.beads/formulas/ (shared workspace, if set)",
];
const EMPTY_FORMULAS: FormulaListEntry[] = [];

export function WorkflowsView() {
  const { projectId, index, openDetail, openEpic } = useApp();
  const list = useFormulas(projectId);
  const formulas = list.data?.formulas ?? EMPTY_FORMULAS;
  const [picked, setPicked] = React.useState<string | null>(null);
  const [pourOpen, setPourOpen] = React.useState(false);
  const selected =
    picked && formulas.some((entry) => entry.name === picked)
      ? picked
      : (formulas[0]?.name ?? null);
  const detail = useFormula(projectId, selected);
  const formula = detail.data ?? null;

  const onPoured = (result: PourResult) => {
    setPourOpen(false);
    const id = result.new_epic_id;
    if (!id) return;
    const bead = index.get(id);
    if (!bead || bead.issue_type === "epic") openEpic(id);
    else openDetail(id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Icon name="feature" size={18} className="text-[var(--text-2)]" />
        <h1 className="text-[15px] font-[650]">Workflows</h1>
        <span className="text-[12px] text-[var(--text-3)]">
          · pour or wisp a formula into work
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {list.isLoading && formulas.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-[var(--text-3)]">
            Loading formulas…
          </div>
        ) : list.error ? (
          <div className="p-10 text-center text-[13px] text-[var(--text-3)]">
            {(list.error as Error).message}
          </div>
        ) : formulas.length === 0 ? (
          <EmptyCatalog />
        ) : (
          <div className="flex h-full min-h-0">
            <aside className="w-[280px] flex-shrink-0 overflow-y-auto border-r border-border p-3">
              <ul className="flex flex-col gap-[2px]">
                {formulas.map((entry) => (
                  <FormulaRow
                    key={entry.name}
                    entry={entry}
                    active={entry.name === selected}
                    onSelect={() => setPicked(entry.name)}
                  />
                ))}
              </ul>
            </aside>
            <section className="min-w-0 flex-1 overflow-y-auto p-6">
              {!selected ? (
                <div className="text-[13px] text-[var(--text-3)]">
                  Select a formula to see its steps and variables.
                </div>
              ) : detail.isLoading && !formula ? (
                <div className="text-[13px] text-[var(--text-3)]">Loading formula…</div>
              ) : detail.error ? (
                <div className="text-[13px] text-[var(--text-3)]">
                  {(detail.error as Error).message}
                </div>
              ) : formula ? (
                <FormulaDetail
                  formula={formula}
                  onPour={() => setPourOpen(true)}
                />
              ) : null}
            </section>
          </div>
        )}
      </div>

      <PourDialog
        open={pourOpen}
        formula={formula}
        onOpenChange={setPourOpen}
        onPoured={onPoured}
      />
    </div>
  );
}

function FormulaRow({
  entry,
  active,
  onSelect,
}: {
  entry: FormulaListEntry;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full flex-col rounded-[9px] px-[10px] py-2 text-left ${
          active
            ? "bg-[var(--brand-weak)] text-[var(--brand)]"
            : "text-[var(--text)] hover:bg-[var(--surface-2)]"
        }`}
      >
        <span className="text-[13.5px] font-[600]">{entry.name}</span>
        {entry.description && (
          <span className="mt-[2px] line-clamp-2 text-[11.5px] text-[var(--text-3)]">
            {entry.description}
          </span>
        )}
        <span className="mt-1 font-mono text-[11px] text-[var(--text-3)]">
          {entry.steps} step{entry.steps === 1 ? "" : "s"} · {entry.vars} var
          {entry.vars === 1 ? "" : "s"}
        </span>
      </button>
    </li>
  );
}

function FormulaDetail({
  formula,
  onPour,
}: {
  formula: Formula;
  onPour: () => void;
}) {
  const varEntries = Object.entries(formula.vars);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-[650] tracking-[-.02em]">{formula.formula}</h2>
          {formula.description && (
            <p className="mt-1 text-[13.5px] text-[var(--text-2)]">{formula.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11.5px] text-[var(--text-3)]">
            <span>{formula.type}</span>
            {formula.phase && <span>phase {formula.phase}</span>}
            {formula.source && <span>{formula.source}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onPour}
          className="h-8 flex-shrink-0 rounded-lg bg-[var(--brand)] px-3 text-[12.5px] font-[650] text-white"
        >
          Pour…
        </button>
      </div>

      <div>
        <h3 className="text-[12px] font-[650] text-[var(--text-2)]">Variables</h3>
        {varEntries.length === 0 ? (
          <p className="mt-2 text-[13px] text-[var(--text-3)]">No variables.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {varEntries.map(([name, def]) => (
              <li
                key={name}
                className="rounded-[10px] border border-border bg-[var(--surface)] px-3 py-[10px]"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[12.5px] font-[600]">{name}</span>
                  {def.required && (
                    <span className="text-[11px] font-[550] text-[var(--brand)]">required</span>
                  )}
                </div>
                {def.description && (
                  <p className="mt-[2px] text-[12.5px] text-[var(--text-2)]">{def.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-[12px] font-[650] text-[var(--text-2)]">Steps</h3>
        {formula.steps.length === 0 ? (
          <p className="mt-2 text-[13px] text-[var(--text-3)]">No steps listed.</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-2">
            {formula.steps.map((step, i) => (
              <li
                key={step.id}
                className="rounded-[10px] border border-border bg-[var(--surface)] px-3 py-[10px]"
              >
                <span className="font-mono text-[11px] text-[var(--text-3)]">
                  {i + 1}. {step.id}
                </span>
                <div className="text-[13.5px] font-[600]">{step.title}</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function EmptyCatalog() {
  return (
    <div className="mx-auto max-w-lg p-10 text-center">
      <p className="text-[14px] font-[650]">No formulas found</p>
      <p className="mt-2 text-[13px] text-[var(--text-2)]">
        This view lists formulas from <span className="font-mono">bd formula list</span>. It does
        not edit TOML. Drop <span className="font-mono">.formula.toml</span> files on a search
        path:
      </p>
      <ol className="mt-4 space-y-1.5 text-left text-[12.5px] text-[var(--text-2)]">
        {SEARCH_PATHS.map((path, i) => (
          <li key={path} className="flex gap-2">
            <span className="font-mono text-[var(--text-3)]">{i + 1}.</span>
            <span className="font-mono">{path}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
