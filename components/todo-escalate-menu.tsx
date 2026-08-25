"use client";
import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Icon, typeIconName } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { useDefer, useUpdateBead } from "@/hooks/use-beads";
import { filterDepCandidates } from "@/lib/dep-picker";
import { prioLabel, typeLabel } from "@/lib/beads-view";
import { BEAD_TYPES, PRIORITIES, type Bead, type UpdateInput } from "@/lib/schema";
import { assign, attachParent, promoteType, raisePriority } from "@/lib/todos";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PROMOTE_TYPES = BEAD_TYPES.filter((t) => t !== "task");
const PARENT_PICKER_LIMIT = 50;
const SNOOZE_PRESETS = [
  { label: "In 1 hour", until: "+1h" },
  { label: "Tomorrow", until: "tomorrow" },
  { label: "In 3 days", until: "+3d" },
  { label: "Next week", until: "next week" },
] as const;

const rowBtnClass =
  "flex h-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-[var(--surface-2)] px-2 text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-50";

export function TodoEscalateMenu({ bead }: { bead: Bead }) {
  const { beads, meta } = useApp();
  const update = useUpdateBead();
  const defer = useDefer();
  const busy = update.isPending || defer.isPending;
  const actor = meta?.humanActor ?? "you";
  const [open, setOpen] = React.useState(false);
  const [parentQuery, setParentQuery] = React.useState("");
  const [untilDraft, setUntilDraft] = React.useState("");

  const assignees = React.useMemo(() => {
    const names = new Set<string>();
    if (actor.trim()) names.add(actor);
    for (const b of beads) {
      const a = b.assignee?.trim();
      if (a) names.add(a);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [actor, beads]);

  const linkedIds = React.useMemo(
    () =>
      (bead.dependencies ?? [])
        .filter((d) => d.type === "parent-child")
        .map((d) => d.depends_on_id),
    [bead.dependencies],
  );

  const parentCandidates = React.useMemo(() => {
    const pool = beads
      .filter((b) => b.status !== "closed")
      .sort(
        (a, b) =>
          Number(a.issue_type !== "epic") - Number(b.issue_type !== "epic") ||
          a.priority - b.priority ||
          a.id.localeCompare(b.id),
      );
    return filterDepCandidates(pool, parentQuery, {
      currentId: bead.id,
      linkedIds,
    });
  }, [bead.id, beads, linkedIds, parentQuery]);

  const shownParents = parentCandidates.slice(0, PARENT_PICKER_LIMIT);

  function closeMenu() {
    setOpen(false);
    setParentQuery("");
    setUntilDraft("");
  }

  function applyUpdate(patch: UpdateInput) {
    closeMenu();
    update.mutate({ id: bead.id, patch });
  }

  function snooze(until: string) {
    const value = until.trim();
    if (!value) return;
    closeMenu();
    defer.mutate({ id: bead.id, until: value });
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setParentQuery("");
          setUntilDraft("");
        }
      }}
    >
      <DropdownMenuTrigger
        disabled={busy}
        aria-label={`Escalate ${bead.id}`}
        title="Escalate"
        className={rowBtnClass}
      >
        <MoreHorizontal size={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuLabel>Escalate</DropdownMenuLabel>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Type</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[160px]">
            {PROMOTE_TYPES.map((t) => (
              <DropdownMenuItem
                key={t}
                disabled={busy}
                onClick={() => applyUpdate(promoteType(t))}
              >
                <Icon name={typeIconName(t)} size={13} />
                {typeLabel(t)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Priority</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[160px]">
            {PRIORITIES.map((p) => (
              <DropdownMenuItem
                key={p}
                disabled={busy}
                onClick={() => applyUpdate(raisePriority(p))}
              >
                {p} · {prioLabel(p)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Parent</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-[280px]">
            <div className="px-1.5 pb-1">
              <input
                value={parentQuery}
                onChange={(e) => setParentQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search by id or title…"
                className="h-7 w-full rounded-[7px] border border-border bg-[var(--surface-2)] px-2 text-[12px] text-[var(--text)] outline-none"
              />
            </div>
            <DropdownMenuSeparator />
            {shownParents.length === 0 ? (
              <div className="px-1.5 py-2 text-[12px] text-[var(--text-3)]">
                No matching beads
              </div>
            ) : (
              shownParents.map((parent) => (
                <DropdownMenuItem
                  key={parent.id}
                  disabled={busy}
                  onClick={() => applyUpdate(attachParent(parent.id))}
                >
                  <span className="flex-shrink-0 font-mono text-[11px] text-[var(--text-3)]">
                    {parent.id}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{parent.title}</span>
                  <span className="flex-shrink-0 text-[10px] uppercase tracking-[.03em] text-[var(--text-3)]">
                    {typeLabel(parent.issue_type)}
                  </span>
                </DropdownMenuItem>
              ))
            )}
            {parentCandidates.length > shownParents.length && (
              <div className="px-1.5 py-1.5 text-[11px] text-[var(--text-3)]">
                Type to narrow {parentCandidates.length - shownParents.length} more…
              </div>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Assign</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[160px]">
            {assignees.map((name) => (
              <DropdownMenuItem
                key={name}
                disabled={busy}
                onClick={() => applyUpdate(assign(name))}
              >
                {name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Snooze</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-[240px]">
            {SNOOZE_PRESETS.map((preset) => (
              <DropdownMenuItem
                key={preset.until}
                disabled={busy}
                onClick={() => snooze(preset.until)}
              >
                {preset.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <div className="flex flex-col gap-1 px-1.5 py-1">
              <input
                key={open ? "snooze-date" : "snooze-date-idle"}
                type="date"
                disabled={busy}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  if (e.target.value) snooze(e.target.value);
                }}
                aria-label="Snooze until date"
                className="h-7 w-full rounded-[7px] border border-border bg-[var(--surface-2)] px-2 text-[12px] text-[var(--text)] outline-none"
              />
              <input
                value={untilDraft}
                disabled={busy}
                onChange={(e) => setUntilDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    snooze(untilDraft);
                  }
                }}
                placeholder="or phrase: tomorrow, +2h…"
                aria-label="Snooze until phrase"
                className="h-7 w-full rounded-[7px] border border-border bg-[var(--surface-2)] px-2 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
              />
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
