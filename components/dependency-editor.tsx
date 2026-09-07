"use client";
import * as React from "react";
import { Command } from "cmdk";
import { useApp } from "@/components/app-context";
import { Icon } from "@/components/icons";
import { useAddDep } from "@/hooks/use-beads";
import { filterDepCandidates } from "@/lib/dep-picker";
import { catColor, statusLabel, typeLabel } from "@/lib/beads-view";
import type { Bead, DepType } from "@/lib/schema";

/** Search and selection stay local until the explicit Add action succeeds. */
export function DependencyEditor({ bead, onDone }: { bead: Bead; onDone: () => void }) {
  const { beads, readOnly } = useApp();
  const addDep = useAddDep();
  const [query, setQuery] = React.useState("");
  const [targetId, setTargetId] = React.useState("");
  const [type, setType] = React.useState<DepType>("blocks");
  const submitting = React.useRef(false);
  const disabled = readOnly || addDep.isPending;
  const eligible = filterDepCandidates(beads, "", {
    currentId: bead.id,
    linkedIds: (bead.dependencies ?? []).map(dep => dep.depends_on_id),
  });
  const candidates = filterDepCandidates(eligible, query, { currentId: bead.id, linkedIds: [] });
  const selected = eligible.find(candidate => candidate.id === targetId);
  const add = () => {
    if (disabled || submitting.current || !selected) return;
    submitting.current = true;
    addDep.mutate({ id: bead.id, dependsOnId: selected.id, type }, {
      onSuccess: onDone,
      onSettled: () => { submitting.current = false; },
    });
  };
  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-[9px] border border-border bg-[var(--surface)] p-[9px_11px]"
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) onDone();
        }
      }}
    >
      {selected ? (
        <div className="flex min-w-0 items-start gap-2 rounded-[9px] border border-border bg-[var(--surface-2)] p-2">
          <div className="min-w-0 flex-1">
            <span className="font-mono text-[11px] text-[var(--text-3)]">{selected.id}</span>
            <div className="break-words text-[12.5px] text-[var(--text)]">{selected.title}</div>
          </div>
          <button
            autoFocus
            type="button"
            aria-label="Clear selected bead"
            title="Clear selected bead"
            disabled={disabled}
            onClick={() => { setTargetId(""); setQuery(""); }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-3)] hover:bg-[var(--surface)]"
          ><Icon name="x" size={13} /></button>
        </div>
      ) : (
        <Command shouldFilter={false} label="Search dependency beads" className="min-w-0">
          <div className="flex items-center gap-2 rounded-[9px] border border-border bg-[var(--surface-2)] px-2 focus-within:border-[var(--brand)]">
            <Icon name="search" size={13} className="shrink-0 text-[var(--text-3)]" />
            <Command.Input
              autoFocus
              aria-label="Search dependency beads"
              placeholder="Search by ID or title…"
              value={query}
              onValueChange={setQuery}
              disabled={disabled}
              className="h-9 min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--text)] outline-none"
            />
          </div>
          <Command.List className="mt-2 max-h-52 overflow-y-auto rounded-[9px] border border-border bg-[var(--surface-2)] py-1">
            <Command.Empty className="px-3 py-4 text-center text-[12px] text-[var(--text-3)]">No matching beads.</Command.Empty>
            {candidates.map(candidate => (
              <Command.Item
                key={candidate.id}
                value={candidate.id}
                disabled={disabled}
                onSelect={() => { if (!disabled) setTargetId(candidate.id); }}
                className="flex cursor-pointer items-start gap-2 px-[9px] py-2 text-[12.5px] data-[selected=true]:bg-[var(--brand-weak)] data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[11px] text-[var(--text-3)]">{candidate.id}</span>
                  <div className="break-words text-[var(--text)]">{candidate.title}</div>
                </div>
                <span className="mt-0.5 shrink-0 text-[10px] uppercase text-[var(--text-3)]">{typeLabel(candidate.issue_type)}</span>
                <span className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: catColor(candidate.status) }} title={statusLabel(candidate.status)} />
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Dependency type"
          value={type}
          onChange={event => setType(event.target.value as DepType)}
          disabled={disabled}
          className="h-8 min-w-0 flex-1 rounded-[9px] border border-border bg-[var(--surface-2)] px-2 text-[12.5px]"
        >
          {/* Hierarchy stays in the Parent/Subtasks controls. Preserve the existing dependency choices. */}
          <option value="blocks">blocked by</option>
          <option value="related">related</option>
        </select>
        <button type="button" aria-label="Cancel dependency" disabled={disabled} onClick={onDone} className="h-8 rounded-md border border-border px-3 text-[12px]">Cancel</button>
        <button type="button" disabled={disabled || !selected} onClick={add} className="h-8 rounded-md bg-[var(--brand)] px-3 text-[12px] font-[550] text-white">Add</button>
      </div>
    </div>
  );
}
