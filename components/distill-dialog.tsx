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
import { useDistillMol } from "@/hooks/use-mol";

const inputClass =
  "h-[38px] w-full rounded-[9px] border border-border bg-[var(--surface-2)] px-3 text-[13.5px] text-[var(--text)] outline-none focus:border-[var(--brand)]";
const labelClass = "text-[12px] font-[550] text-[var(--text-2)]";

function filledVars(rows: { key: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(
    rows.filter((row) => row.key.trim() && row.value.trim()).map((row) => [row.key.trim(), row.value.trim()]),
  );
}

export function DistillDialog({
  open,
  epicId,
  onOpenChange,
}: {
  open: boolean;
  epicId: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)] sm:max-w-lg"
      >
        {open && (
          <DistillForm epicId={epicId} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DistillForm({ epicId, onClose }: { epicId: string; onClose: () => void }) {
  const { projectId } = useApp();
  const distill = useDistillMol(projectId);
  const [name, setName] = React.useState("");
  const [rows, setRows] = React.useState([{ key: "", value: "" }]);

  const setRow = (index: number, patch: Partial<{ key: string; value: string }>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const run = async () => {
    await distill.mutateAsync({
      epicId,
      name: name.trim(),
      vars: filledVars(rows),
    });
    onClose();
  };

  return (
    <>
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-[15px] font-[650]">Save as formula</DialogTitle>
          <DialogDescription className="mt-1 text-[12.5px] text-[var(--text-3)]">
            Distill this molecule into a reusable formula. Optional mappings become{" "}
            {"{{variables}}"}.
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
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Formula name</span>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-workflow"
          />
        </label>
        <div>
          <div className={labelClass}>Variable mappings</div>
          <p className="mt-1 text-[12px] text-[var(--text-3)]">
            Optional. Each row is --var name=value.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={inputClass}
                  placeholder="name"
                  value={row.key}
                  onChange={(e) => setRow(i, { key: e.target.value })}
                />
                <input
                  className={inputClass}
                  placeholder="value"
                  value={row.value}
                  onChange={(e) => setRow(i, { value: e.target.value })}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRows((current) => [...current, { key: "", value: "" }])}
            className="mt-2 text-[12.5px] text-[var(--brand)]"
          >
            Add mapping
          </button>
        </div>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-lg px-3 text-[13px] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim() || distill.isPending}
          onClick={() => void run()}
          className="h-9 rounded-lg bg-[var(--brand)] px-3 text-[13px] font-[550] text-white disabled:opacity-50"
        >
          Distill
        </button>
      </footer>
    </>
  );
}
