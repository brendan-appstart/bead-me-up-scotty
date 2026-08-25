"use client";
import { Icon } from "@/components/icons";
import type { MolProgress, MolShow } from "@/lib/formulas";

export function MolProgressPanel({
  progress,
  show,
  onDistill,
}: {
  progress: MolProgress | null | undefined;
  show: MolShow | null | undefined;
  onDistill: () => void;
}) {
  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? 0;
  const pct = total ? Math.round(progress?.percent ?? 0) : 0;
  const ready = show?.parallel?.ready_steps ?? 0;

  return (
    <div className="mb-[18px] rounded-[10px] border border-border bg-[var(--surface-2)] p-[12px_13px]">
      <div className="mb-2 flex items-center gap-2">
        <Icon name="target" size={14} className="text-[var(--brand)]" />
        <span className="text-[11px] font-[550] uppercase tracking-[.03em] text-[var(--text-3)]">
          Molecule
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onDistill}
          className="rounded-md border border-border bg-[var(--surface)] px-2 py-[3px] text-[11.5px] font-[550] text-[var(--text-2)] hover:border-[var(--brand)] hover:text-[var(--text)]"
        >
          Save as formula
        </button>
      </div>
      <div className="flex items-center gap-[9px]">
        <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${pct}%`,
              background: pct === 100 ? "#16a34a" : "var(--brand)",
            }}
          />
        </div>
        <span className="flex-shrink-0 font-mono text-[11px] text-[var(--text-3)]">
          {completed}/{total} · {pct}%
        </span>
      </div>
      {progress?.current_step_id ? (
        <p className="mt-2 font-mono text-[11.5px] text-[var(--text-3)]">
          Current {progress.current_step_id}
        </p>
      ) : null}
      {ready > 0 ? (
        <p className="mt-1.5 text-[12px] text-[var(--text-2)]">
          {ready} step{ready === 1 ? "" : "s"} can run in parallel.
        </p>
      ) : null}
    </div>
  );
}
