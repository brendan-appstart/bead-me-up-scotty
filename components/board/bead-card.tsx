"use client";
import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Bead } from "@/lib/schema";
import { Icon, typeIconName } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { CopyableId } from "@/components/copyable-id";
import { beadOrigin, originTitle } from "@/lib/attribution";
import {
  catColor,
  statusLabel,
  prioColor,
  prioLabel,
  typeColor,
  typeLabel,
  avatarColor,
  initials,
  isBlocked,
  parentOf,
  checklistProgress,
  epicProgress,
  type ChildProgress,
} from "@/lib/beads-view";

export function BeadCard({ bead, childCount = 0 }: { bead: Bead; childCount?: number }) {
  const { beads, index, humanAllowlist, openDetail } = useApp();
  const childProgress = React.useMemo(() => epicProgress(bead.id, beads), [bead.id, beads]);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bead.id,
  });

  const o = beadOrigin(bead, humanAllowlist);
  const parent = parentOf(bead, index);
  const blocked = isBlocked(bead, index);
  const visLabels = (bead.labels ?? []).filter((l) => l !== "archived").slice(0, 2);
  const depCount = (bead.dependencies ?? []).filter((d) => d.type !== "parent-child").length;
  const commentCount = (bead.comments ?? []).length;
  const checklist = checklistProgress(bead.description);

  return (
    <article
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => openDetail(bead.id)}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        boxShadow: "var(--shadow)",
        zIndex: isDragging ? 10 : undefined,
      }}
      className="flex cursor-pointer touch-none flex-col gap-[9px] rounded-[11px] border border-border bg-[var(--surface)] p-[12px_13px] transition-[border-color,box-shadow] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ background: catColor(bead.status) }}
          title={statusLabel(bead.status)}
        />
        <CopyableId
          id={bead.id}
          className="font-mono text-[11.5px] tracking-[-.01em] text-[var(--text-3)]"
        />
        <span className="flex-1" />
        <PriorityChip p={bead.priority} />
        <OriginBadge origin={o} title={originTitle(bead.created_by, o)} />
      </div>

      <div className="text-[13.5px] font-[550] leading-[1.35] tracking-[-.006em] text-[var(--text)] [text-wrap:pretty]">
        {bead.title}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-[5px] text-[11.5px] text-[var(--text-2)]">
          <Icon
            name={typeIconName(bead.issue_type)}
            size={13}
            style={{ color: typeColor(bead.issue_type) }}
          />
          <span>{typeLabel(bead.issue_type)}</span>
        </span>
        {visLabels.map((l) => (
          <span
            key={l}
            className="rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px font-mono text-[10.5px] text-[var(--text-3)]"
          >
            {l}
          </span>
        ))}
      </div>

      <div className="mt-px flex items-center gap-[10px] border-t border-border pt-[9px]">
        <span className="inline-flex min-w-0 items-center gap-[6px]">
          <span
            className="flex h-[19px] w-[19px] flex-shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white"
            style={{ background: avatarColor(bead.assignee ?? "") }}
          >
            {initials(bead.assignee ?? "")}
          </span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-[var(--text-2)]">
            {bead.assignee || "Unassigned"}
          </span>
        </span>
        <span className="flex-1" />
        {depCount > 0 && (
          <span
            title="dependencies"
            className="inline-flex items-center gap-[3px] font-mono text-[11px]"
            style={{ color: blocked ? "#ef4444" : "var(--text-3)" }}
          >
            <Icon name="link" size={13} />
            {depCount}
          </span>
        )}
        {commentCount > 0 && (
          <span
            title="comments"
            className="inline-flex items-center gap-[3px] font-mono text-[11px] text-[var(--text-3)]"
          >
            <Icon name="comment" size={13} />
            {commentCount}
          </span>
        )}
        {checklist.total > 0 && (
          <span
            title="checklist progress"
            className="inline-flex items-center gap-[3px] font-mono text-[11px]"
            style={{ color: checklist.done === checklist.total ? "#16a34a" : "var(--text-3)" }}
          >
            <Icon name="check" size={13} />
            {checklist.done}/{checklist.total}
          </span>
        )}
        {/* Epic parents keep the brand-coloured chip; any other parent gets a
            neutral one with its own type icon. Previously every parent rendered
            as an "epic", which was already wrong and gets much more visible
            now that arbitrary subtasks exist. */}
        {parent && (
          <span
            title={`${parent.id} · ${parent.title}`}
            className={
              parent.issue_type === "epic"
                ? "inline-flex max-w-[96px] items-center gap-1 rounded-md bg-[var(--brand-weak)] px-[6px] py-px text-[10.5px] font-[550] text-[var(--brand)]"
                : "inline-flex max-w-[96px] items-center gap-1 rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px text-[10.5px] font-[550] text-[var(--text-3)]"
            }
          >
            <Icon
              name={parent.issue_type === "epic" ? "target" : typeIconName(parent.issue_type)}
              size={11}
              className="flex-shrink-0"
            />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {parent.title.replace(/\s*\([^)]*\)\s*/, "")}
            </span>
          </span>
        )}
        {/* Subtask count — distinct from depCount, which deliberately excludes
            parent-child edges. Counted once per render by the board/list, not
            per card, to avoid an O(n^2) scan. */}
        {childCount > 0 && (
          <span
            title={`${childCount} subtask${childCount === 1 ? "" : "s"}`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px text-[10.5px] font-[550] text-[var(--text-3)]"
          >
            <Icon name="list" size={11} className="flex-shrink-0" />
            {childCount}
          </span>
        )}
        <ChildProgressHint progress={childProgress} />
      </div>
    </article>
  );
}

/** Closed ÷ children progress — hidden when the bead has no children. */
export function ChildProgressHint({
  progress,
  variant = "compact",
}: {
  progress: ChildProgress;
  variant?: "compact" | "inline" | "detail";
}) {
  if (progress.total === 0) return null;
  const done = progress.pct === 100;
  const barColor = done ? "#16a34a" : "var(--brand)";

  if (variant === "detail") {
    return (
      <div className="flex w-[200px] flex-shrink-0 flex-col items-end gap-[7px]">
        <div className="flex items-baseline gap-[6px]">
          <span className="font-mono text-[17px] font-[650] tracking-[-.02em]">{progress.pct}%</span>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {progress.closed}/{progress.total} done
          </span>
        </div>
        <div className="h-[7px] w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${progress.pct}%`, background: barColor }}
          />
        </div>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-[9px]">
        <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${progress.pct}%`, background: barColor }}
          />
        </div>
        <span className="flex-shrink-0 font-mono text-[11px] text-[var(--text-3)]">
          {progress.closed}/{progress.total} · {progress.pct}%
        </span>
      </div>
    );
  }

  return (
    <span
      title={`${progress.closed}/${progress.total} children closed (${progress.pct}%)`}
      className="inline-flex min-w-0 max-w-[88px] items-center gap-[5px]"
    >
      <span className="h-[5px] w-[44px] flex-shrink-0 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${progress.pct}%`, background: barColor }}
        />
      </span>
      <span className="font-mono text-[10.5px] text-[var(--text-3)]">
        {progress.closed}/{progress.total}
      </span>
    </span>
  );
}

export function PriorityChip({ p }: { p: number }) {
  const c = prioColor(p);
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded-md px-[7px] py-[3px] text-[10.5px] font-semibold leading-none tracking-[.01em]"
      style={{ color: c, background: `${c}1f`, border: `1px solid ${c}33` }}
    >
      {prioLabel(p)}
    </span>
  );
}

export function OriginBadge({
  origin,
  title,
  withLabel = false,
}: {
  origin: "human" | "agent";
  title: string;
  withLabel?: boolean;
}) {
  const human = origin === "human";
  return (
    <span
      title={title}
      className="inline-flex flex-shrink-0 items-center justify-center gap-[5px] rounded-md"
      style={
        withLabel
          ? {
              padding: "3px 9px",
              fontSize: "11.5px",
              fontWeight: 550,
              color: human ? "var(--text-2)" : "var(--brand)",
              background: human ? "var(--surface-2)" : "var(--brand-weak)",
              border: `1px solid ${human ? "var(--border)" : "transparent"}`,
            }
          : {
              width: 20,
              height: 20,
              color: human ? "var(--text-2)" : "var(--brand)",
              background: human ? "var(--surface-2)" : "var(--brand-weak)",
              border: `1px solid ${human ? "var(--border)" : "var(--brand-weak)"}`,
            }
      }
    >
      <Icon name={human ? "user" : "bot"} size={withLabel ? 13 : 12} />
      {withLabel && (human ? "Human" : "Agent")}
    </span>
  );
}
