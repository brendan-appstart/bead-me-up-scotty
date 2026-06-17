"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { useCreateBead } from "@/hooks/use-beads";
import { typeLabel } from "@/lib/beads-view";
import { BEAD_TYPES, type BeadType } from "@/lib/schema";

const inputClass =
  "h-[38px] rounded-[9px] border border-border bg-[var(--surface-2)] px-3 text-[13.5px] text-[var(--text)] outline-none focus:border-[var(--brand)]";
const selectClass =
  "h-[38px] cursor-pointer rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-[13px] text-[var(--text)] outline-none";
const labelClass = "text-[12px] font-[550] text-[var(--text-2)]";

interface FormState {
  type: BeadType;
  priority: number;
  title: string;
  description: string;
  assignee: string;
  parent: string;
  labels: string;
  backlog: boolean;
}

export function CreateBeadModal({
  open,
  parent,
  onOpenChange,
}: {
  open: boolean;
  parent: string;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[540px] max-w-[100%] gap-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)]"
      >
        {open && <CreateForm parent={parent} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({ parent, onClose }: { parent: string; onClose: () => void }) {
  const { beads, meta } = useApp();
  const create = useCreateBead();
  const actor = meta?.humanActor ?? "you";

  const [form, setForm] = React.useState<FormState>({
    type: "task",
    priority: 2,
    title: "",
    description: "",
    assignee: "",
    parent,
    labels: "",
    backlog: false,
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const epics = beads.filter((b) => b.issue_type === "epic");
  const assignees = Array.from(
    new Set([actor, ...(beads.map((b) => b.assignee).filter(Boolean) as string[])]),
  );

  function submit() {
    if (!form.title.trim()) return;
    create.mutate(
      {
        title: form.title.trim(),
        issue_type: form.type,
        priority: form.priority,
        description: form.description,
        assignee: form.assignee,
        labels: form.labels.split(",").map((s) => s.trim()).filter(Boolean),
        parent: form.parent,
        backlog: form.backlog,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <>
      <div className="flex items-center gap-[10px] border-b border-border p-[17px_20px]">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--brand-weak)] text-[var(--brand)]">
          <Icon name="plus" size={16} />
        </div>
        <div className="flex-1">
          <DialogTitle className="text-[15px] font-[650]">
            {parent ? "New child bead" : "New bead"}
          </DialogTitle>
          <DialogDescription className="font-mono text-[11.5px] text-[var(--text-3)]">
            bd create … --json
          </DialogDescription>
        </div>
        <button
          onClick={onClose}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-[14px] p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>Type</span>
            <select className={selectClass} value={form.type} onChange={(e) => set("type", e.target.value as BeadType)}>
              {BEAD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>Priority</span>
            <select
              className={selectClass}
              value={String(form.priority)}
              onChange={(e) => set("priority", Number(e.target.value))}
            >
              {[0, 1, 2, 3, 4].map((p) => (
                <option key={p} value={String(p)}>
                  {p} · {["Critical", "High", "Medium", "Low", "Backlog"][p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Title</span>
          <input
            autoFocus
            className={inputClass}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="What needs doing?"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Description</span>
          <textarea
            className={`${inputClass} h-auto resize-y py-[10px] leading-[1.5]`}
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Optional details, acceptance criteria…"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>Assignee</span>
            <select className={selectClass} value={form.assignee} onChange={(e) => set("assignee", e.target.value)}>
              <option value="">Unassigned</option>
              {assignees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>Parent epic</span>
            <select className={selectClass} value={form.parent} onChange={(e) => set("parent", e.target.value)}>
              <option value="">No epic</option>
              {epics.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>
            Labels <span className="font-normal text-[var(--text-3)]">· comma separated</span>
          </span>
          <input
            className={`${inputClass} font-mono`}
            value={form.labels}
            onChange={(e) => set("labels", e.target.value)}
            placeholder="ui, dnd, m3"
          />
        </label>

        <label className="flex cursor-pointer select-none items-center gap-[9px]">
          <input
            type="checkbox"
            checked={form.backlog}
            onChange={(e) => set("backlog", e.target.checked)}
            className="h-4 w-4 cursor-pointer"
            style={{ accentColor: "var(--brand)" }}
          />
          <span className="text-[13px] text-[var(--text-2)]">
            Start in Backlog (<span className="font-mono">deferred</span>) instead of Ready
          </span>
        </label>
      </div>

      <div className="flex items-center gap-[10px] border-t border-border p-[15px_20px]">
        <div className="flex flex-1 items-center gap-[7px] text-[11.5px] text-[var(--text-3)]">
          <Icon name="user" size={13} className="text-[var(--text-2)]" />
          <span>
            Stamped <span className="font-mono text-[var(--text-2)]">created_by={actor}</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="h-[38px] rounded-[9px] border border-border bg-[var(--surface-2)] px-4 text-[13px] font-[550] text-[var(--text)] hover:bg-[var(--surface-3)]"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!form.title.trim() || create.isPending}
          className="flex h-[38px] items-center gap-[7px] rounded-[9px] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--brand)", boxShadow: "0 2px 8px -2px var(--brand)" }}
        >
          <Icon name="check" size={15} />
          <span>Create bead</span>
        </button>
      </div>
    </>
  );
}
