"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { Icon } from "@/components/icons";
import { useUpdateBead } from "@/hooks/use-beads";
import { avatarColor, initials } from "@/lib/beads-view";
import type { Bead } from "@/lib/schema";

/** Assignment is independent of the drawer's description and comment drafts. */
export function AssigneeField({ bead }: { bead: Bead }) {
  const { beads, meta, readOnly } = useApp();
  const update = useUpdateBead();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const submitting = React.useRef(false);
  const listId = React.useId();
  const suggestions = Array.from(new Set(
    [meta?.humanActor, ...beads.map(b => b.assignee)]
      .map(name => name?.trim()).filter((name): name is string => !!name),
  )).sort((a, b) => a.localeCompare(b));
  const save = () => {
    if (readOnly || submitting.current) return;
    const assignee = draft.trim();
    if (assignee === (bead.assignee ?? "")) {
      setEditing(false);
      return;
    }
    submitting.current = true;
    update.mutate({ id: bead.id, patch: { assignee } }, {
      onSuccess: () => setEditing(false),
      onSettled: () => { submitting.current = false; },
    });
  };
  return (
    <div className="flex min-w-0 flex-col gap-[5px]">
      <span className="text-[11px] font-[550] uppercase tracking-[.03em] text-[var(--text-3)]">Assignee</span>
      {editing ? (
        <div className="flex flex-col gap-2">
          <input
            autoFocus
            aria-label="Assignee"
            placeholder="Unassigned"
            list={listId}
            value={draft}
            disabled={readOnly || update.isPending}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                save();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setEditing(false);
              }
            }}
            className="h-9 w-full min-w-0 rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-[13px] outline-none focus:border-[var(--brand)]"
          />
          <datalist id={listId}>{suggestions.map(name => <option key={name} value={name} />)}</datalist>
          <span className="text-[11px] text-[var(--text-3)]">Choose or type a name. Leave blank to unassign.</span>
          <div className="flex gap-2">
            <button type="button" aria-label="Save assignee" disabled={readOnly || update.isPending} onClick={save} className="rounded-lg bg-[var(--brand)] px-3 py-1 text-[12px] text-white">Save</button>
            <button type="button" aria-label="Cancel assignee edit" disabled={readOnly || update.isPending} onClick={() => setEditing(false)} className="rounded-lg border border-border px-3 py-1 text-[12px]">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-label="Change assignee"
          title="Change assignee"
          disabled={readOnly || update.isPending}
          onClick={() => { setDraft(bead.assignee ?? ""); setEditing(true); }}
          className="flex h-9 min-w-0 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-left hover:border-[var(--brand)]"
        >
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white" style={{ background: avatarColor(bead.assignee ?? "") }}>{initials(bead.assignee ?? "")}</span>
          <span className="min-w-0 flex-1 truncate text-[13px]">{bead.assignee || "Unassigned"}</span>
          <Icon name="pencil" size={12} className="shrink-0 text-[var(--text-3)]" />
        </button>
      )}
    </div>
  );
}
