"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/icons";
import { useCreateBead } from "@/hooks/use-beads";
import { createInputSchema, type CreateInput } from "@/lib/schema";

/** Slim todo capture: title only, open task at P2 (not backlog). */
export function todoCreateInput(title: string): Pick<
  CreateInput,
  "title" | "issue_type" | "priority"
> {
  return {
    title: title.trim(),
    issue_type: "task",
    priority: 2,
  };
}

export type CaptureKeyAction = "submit" | "cancel" | null;

export function captureKeyAction(key: string): CaptureKeyAction {
  if (key === "Escape") return "cancel";
  if (key === "Enter") return "submit";
  return null;
}

export function isQuickCaptureShortcut(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const k = e.key.toLowerCase();
  return k === "c" || k === "q";
}

const inputClass =
  "h-[38px] w-full rounded-[9px] border border-border bg-[var(--surface-2)] px-3 text-[13.5px] text-[var(--text)] outline-none focus:border-[var(--brand)]";

export function QuickCapture({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)] sm:max-w-[480px]"
        style={{ width: 480, maxWidth: "94vw" }}
      >
        {open && <QuickCaptureForm onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function QuickCaptureForm({ onClose }: { onClose: () => void }) {
  const create = useCreateBead();
  const [title, setTitle] = React.useState("");

  function submit() {
    const payload = todoCreateInput(title);
    if (!payload.title || create.isPending) return;
    create.mutate(createInputSchema.parse(payload), { onSuccess: () => onClose() });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const action = captureKeyAction(e.key);
    if (action === "cancel") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (action === "submit") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-[10px] border-b border-border p-[14px_16px]">
        <div className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] bg-[var(--brand-weak)] text-[var(--brand)]">
          <Icon name="task" size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-[14px] font-[650]">Quick capture</DialogTitle>
          <DialogDescription className="text-[11.5px] text-[var(--text-3)]">
            Title only · task · P2
          </DialogDescription>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel capture"
          className="flex h-[28px] w-[28px] items-center justify-center rounded-lg border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] font-[550] text-[var(--text-2)]">Title</span>
          <input
            autoFocus
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="What needs doing?"
            aria-label="Todo title"
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11.5px] text-[var(--text-3)]">
            Enter to create · Esc to cancel
          </span>
          <button
            type="submit"
            disabled={!title.trim() || create.isPending}
            className="flex h-[34px] items-center gap-[6px] rounded-[9px] px-3 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            <Icon name="check" size={14} />
            Capture
          </button>
        </div>
      </form>
    </>
  );
}
