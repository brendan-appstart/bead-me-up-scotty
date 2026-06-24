"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { useCreateBead, beadsKey } from "@/hooks/use-beads";
import { useImageDrop } from "@/hooks/use-image-drop";
import { useResizableWidth } from "@/hooks/use-resizable-width";
import { DescriptionContent, hasImageRef } from "@/components/description-content";
import { api } from "@/lib/api-client";
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
  // ~50% wider than the old 540px default; drag the right edge to resize (persisted).
  const { width, startResize } = useResizableWidth({
    storageKey: "bmus.width.create",
    defaultWidth: 810,
    min: 480,
    max: 1200,
    deltaFactor: 2,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        style={{ width, maxWidth: "96vw" }}
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)]"
      >
        <div
          onPointerDown={startResize}
          title="Drag to resize"
          className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-ew-resize hover:bg-[var(--brand)]/40"
        />
        {open && <CreateForm parent={parent} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({ parent, onClose }: { parent: string; onClose: () => void }) {
  const { beads, meta, projectId } = useApp();
  const create = useCreateBead();
  const qc = useQueryClient();
  const actor = meta?.humanActor ?? "you";
  const isDemo = meta?.kind === "demo";

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

  // Images dropped before the bead exists go to a draft folder; on create we
  // rename that folder to the real id and rewrite the refs in the description.
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const uid = React.useId();
  const draftId = React.useMemo(() => "draft-" + uid.replace(/[^a-zA-Z0-9]/g, ""), [uid]);

  // Auto-grow a textarea to fit its content (used by the title field).
  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  const drop = useImageDrop({
    projectId,
    beadId: draftId,
    disabled: isDemo,
    disabledMessage: "Attachments aren't available for the Demo project.",
    textareaRef: taRef,
    value: form.description,
    onChange: (v) => set("description", v),
  });

  const epics = beads.filter((b) => b.issue_type === "epic");
  const assignees = Array.from(
    new Set([actor, ...(beads.map((b) => b.assignee).filter(Boolean) as string[])]),
  );

  function submit() {
    if (!form.title.trim() || create.isPending) return;
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
      {
        onSuccess: async (newBead) => {
          if (form.description.includes(`attachment://${draftId}/`)) {
            try {
              await api.attachments.finalize(projectId, draftId, newBead.id);
              const rewritten = form.description.replaceAll(
                `attachment://${draftId}/`,
                `attachment://${newBead.id}/`,
              );
              await api.update(projectId, newBead.id, { description: rewritten });
              qc.invalidateQueries({ queryKey: beadsKey(projectId) });
            } catch (e) {
              toast.error((e as Error).message);
            }
          }
          onClose();
        },
      },
    );
  }

  // Cmd/Ctrl+Enter creates the bead from anywhere in the modal. A ref keeps the
  // listener pointed at the latest closure without re-binding on every keystroke.
  const submitRef = React.useRef(submit);
  React.useEffect(() => {
    submitRef.current = submit;
  });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="flex shrink-0 items-center gap-[10px] border-b border-border p-[17px_20px]">
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

      <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto p-5">
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
          <textarea
            autoFocus
            ref={autosize}
            rows={1}
            className={`${inputClass} h-auto min-h-[38px] resize-none overflow-hidden py-[9px] leading-[1.4]`}
            value={form.title}
            onChange={(e) => {
              set("title", e.target.value);
              autosize(e.currentTarget);
            }}
            placeholder="What needs doing?"
            onKeyDown={(e) => {
              // Enter submits (titles are single-line); the box still grows as text wraps.
              // Cmd/Ctrl+Enter is owned by the modal-wide listener — skip it here so it
              // doesn't submit twice.
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>
            Description{" "}
            {!isDemo && (
              <span className="font-normal text-[var(--text-3)]">· drop or paste images</span>
            )}
          </span>
          <div
            className="relative"
            onDrop={drop.onDrop}
            onDragOver={drop.onDragOver}
            onDragLeave={drop.onDragLeave}
          >
            <textarea
              ref={taRef}
              className={`${inputClass} h-auto w-full resize-y py-[10px] leading-[1.5] ${
                drop.dragOver ? "border-[var(--brand)] ring-1 ring-[var(--brand)]" : ""
              }`}
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              onPaste={drop.onPaste}
              placeholder={
                isDemo
                  ? "Optional details, acceptance criteria…"
                  : "Optional details, acceptance criteria… drag and drop screenshots and images here too!"
              }
            />
            {drop.uploading && (
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--text-3)]">
                <Icon name="image" size={12} /> Uploading…
              </span>
            )}
          </div>
          {!isDemo && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={drop.pickFiles}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-[6px] rounded-[8px] border border-border bg-[var(--surface-2)] px-[10px] py-[6px] text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)]"
              >
                <Icon name="image" size={14} /> Attach image
              </button>
            </div>
          )}
          {hasImageRef(form.description) && (
            <DescriptionContent
              text={form.description}
              projectId={projectId}
              className="mt-1 rounded-[8px] border border-border bg-[var(--surface-2)] p-2 text-[12.5px] text-[var(--text-2)]"
            />
          )}
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

      <div className="flex shrink-0 items-center gap-[10px] border-t border-border p-[15px_20px]">
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
