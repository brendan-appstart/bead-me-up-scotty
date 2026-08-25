"use client";
import * as React from "react";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { useSetStatus } from "@/hooks/use-beads";
import { listOpenTodos } from "@/lib/todos";
import { relTime, fmtDateTime } from "@/lib/beads-view";
import type { Bead } from "@/lib/schema";

function sortTodos(a: Bead, b: Bead): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
}

export function TodosView() {
  const { beads, openDetail } = useApp();
  const todos = React.useMemo(() => listOpenTodos(beads).sort(sortTodos), [beads]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Icon name="task" size={18} className="text-[var(--text-2)]" />
        <h1 className="text-[15px] font-[650]">Todos</h1>
        <span className="text-[12px] text-[var(--text-3)]">
          · {todos.length === 0 ? "inbox empty" : `${todos.length} open`}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {todos.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-[var(--text-3)]">
            No open todos. Press <kbd className="rounded border px-1 font-mono text-[12px]">C</kbd>{" "}
            or <kbd className="rounded border px-1 font-mono text-[12px]">Q</kbd> to quick-capture
            one.
          </div>
        ) : (
          <ol className="mx-auto flex max-w-3xl flex-col gap-2">
            {todos.map((bead) => (
              <TodoRow key={bead.id} bead={bead} onOpen={() => openDetail(bead.id)} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function TodoRow({ bead, onOpen }: { bead: Bead; onOpen: () => void }) {
  const setStatus = useSetStatus();
  const busy = setStatus.isPending;

  return (
    <li className="flex items-center gap-2 rounded-[10px] border border-border bg-[var(--surface)] px-3 py-[10px]">
      <button
        onClick={onOpen}
        className="min-w-0 flex-1 text-left hover:underline"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[var(--text-3)]">{bead.id}</span>
          <span
            title={fmtDateTime(bead.updated_at)}
            className="text-[11px] text-[var(--text-3)]"
          >
            {relTime(bead.updated_at)}
          </span>
        </div>
        <div className="mt-[2px] text-[14px] font-[600] leading-snug text-[var(--text)]">
          {bead.title}
        </div>
      </button>
      <button
        disabled={busy}
        onClick={() => setStatus.mutate({ id: bead.id, status: "closed" })}
        title="Mark done"
        className="flex h-8 flex-shrink-0 items-center gap-[6px] rounded-lg border border-border bg-[var(--surface-2)] px-3 text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-50"
      >
        <Icon name="check" size={14} />
        Done
      </button>
    </li>
  );
}
