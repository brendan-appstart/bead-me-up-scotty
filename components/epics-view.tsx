"use client";
import * as React from "react";
import { Icon, typeIconName } from "@/components/icons";
import { OriginBadge, PriorityChip } from "@/components/board/bead-card";
import { useApp } from "@/components/app-context";
import { beadOrigin, originTitle } from "@/lib/attribution";
import {
  catColor,
  statusLabel,
  typeColor,
  avatarColor,
  initials,
  childrenOf,
  epicProgress,
} from "@/lib/beads-view";

/** Chip styling shared with the list rows and drawer so labels read alike. */
const labelChipClass =
  "flex-shrink-0 rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px font-mono text-[10.5px] text-[var(--text-3)]";

/**
 * Label chips with a "+N" overflow indicator. `archived` is state, not a tag —
 * the Epics screen has no archived toggle at all, so it would be pure noise.
 */
function LabelChips({ labels, max }: { labels: string[]; max: number }) {
  const visible = labels.filter((l) => l !== "archived");
  if (visible.length === 0) return null;
  const shown = visible.slice(0, max);
  const hidden = visible.slice(max);
  return (
    <>
      {shown.map((l) => (
        <span key={l} className={`hidden ${labelChipClass} lg:inline`}>
          {l}
        </span>
      ))}
      {hidden.length > 0 && (
        <span className={`hidden ${labelChipClass} lg:inline`} title={hidden.join(", ")}>
          +{hidden.length}
        </span>
      )}
    </>
  );
}

export function EpicsView({ focusEpic }: { focusEpic?: { id: string; nonce: number } | null }) {
  const { beads, humanAllowlist, openCreate, openDetail, readOnly } = useApp();
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [hideClosed, setHideClosed] = React.useState(true);
  // Explicitly ordered: open before closed, then priority ascending, then id
  // for stability. Previously a bare .filter(), so the apparent priority order
  // was incidental to whatever `bd export` returned.
  const allEpics = beads
    .filter((b) => b.issue_type === "epic")
    .sort(
      (a, b) =>
        Number(a.status === "closed") - Number(b.status === "closed") ||
        a.priority - b.priority ||
        a.id.localeCompare(b.id),
    );
  // "Filter out closed" (bead 8vm): hide closed epics (and closed children below).
  // Progress % still counts all children, so it stays accurate. A focused epic —
  // jumped to from a bead's detail drawer (bead 55b) — is always shown.
  const epics = allEpics.filter(
    (e) => !hideClosed || e.status !== "closed" || e.id === focusEpic?.id,
  );

  // On a focus request, scroll the target epic into view and flash it. DOM-only
  // side effects (no setState) keep this a clean effect; the nonce re-triggers it
  // even when the same epic is requested twice.
  React.useEffect(() => {
    if (!focusEpic) return;
    const el = document.querySelector<HTMLElement>(`[data-epic-id="${CSS.escape(focusEpic.id)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("epic-flash");
    const t = setTimeout(() => el.classList.remove("epic-flash"), 1600);
    return () => clearTimeout(t);
  }, [focusEpic]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="flex-1">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Epics</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {epics.length}
            {hideClosed && allEpics.length !== epics.length ? ` of ${allEpics.length}` : ""} epics ·
            progress = closed ÷ children
          </span>
        </div>
        <button
          onClick={() => setHideClosed((v) => !v)}
          title={hideClosed ? "Closed epics and children are hidden" : "Showing closed epics and children"}
          className="flex h-9 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[12px] text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)]"
        >
          <Icon name={hideClosed ? "check" : "x"} size={14} />
          <span>Hide closed</span>
        </button>
        <button
          disabled={readOnly}
          onClick={() => openCreate({ type: "epic" })}
          className="flex h-9 items-center gap-[6px] rounded-[9px] px-[14px] text-[13px] font-[550] text-white"
          style={{ background: "var(--brand)" }}
        >
          <Icon name="plus" size={15} />
          <span>New epic</span>
        </button>
      </header>

      <div className="bd-scroll min-h-0 flex-1 overflow-y-auto p-[20px_22px]">
        <div className="mx-auto flex max-w-[880px] flex-col gap-[14px]">
          {epics.map((e) => {
            const { closed, total, pct } = epicProgress(e.id, beads);
            const kids = childrenOf(e.id, beads)
              .filter((k) => !hideClosed || k.status !== "closed")
              .sort(
                (a, b) =>
                  Number(a.status === "closed") - Number(b.status === "closed") ||
                  a.priority - b.priority,
              );
            // Auto-expand the epic we jumped to (until the user toggles it).
            const isOpen = expanded[e.id] ?? e.id === focusEpic?.id;
            return (
              <section
                key={e.id}
                data-epic-id={e.id}
                className="overflow-hidden rounded-[14px] border border-border bg-[var(--surface)] shadow-[var(--shadow)]"
              >
                {/* Expanding to see children is the PRIMARY action on this
                    screen, so the whole row owns it and the small "Details"
                    button below owns the secondary one. An earlier pass had
                    this inverted — row-click opened details and expand was
                    left to the ~28px chevron alone — which @Nopik reported as
                    a regression on GH #17. Note `!isOpen`, not `!st[e.id]`:
                    isOpen resolves the auto-expand default, and reading the raw
                    map reintroduces the "focused epic won't collapse" bug. */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => setExpanded((st) => ({ ...st, [e.id]: !isOpen }))}
                  onKeyDown={(ev) => {
                    if (ev.target !== ev.currentTarget) return;
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setExpanded((st) => ({ ...st, [e.id]: !isOpen }));
                    }
                  }}
                  title={isOpen ? "Hide children" : "Show children"}
                  className="flex cursor-pointer items-center gap-[14px] p-[16px_18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--brand-weak)] text-[var(--brand)]">
                    <Icon name="target" size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* overflow-hidden: every chip on this row is flex-shrink-0,
                        so without it a heavily-labelled epic would spill past
                        the progress block instead of clipping. */}
                    <div className="flex min-w-0 items-center gap-[9px] overflow-hidden">
                      <span className="flex-shrink-0 font-mono text-[11.5px] text-[var(--text-3)]">
                        {e.id}
                      </span>
                      <StatusChip status={e.status} />
                      <PriorityChip p={e.priority} />
                      <LabelChips labels={e.labels ?? []} max={3} />
                    </div>
                    <div className="mt-[3px] text-[15px] font-semibold tracking-[-.01em]">
                      {e.title}
                    </div>
                  </div>
                  <div className="flex w-[200px] flex-shrink-0 flex-col items-end gap-[7px]">
                    <div className="flex items-baseline gap-[6px]">
                      <span className="font-mono text-[17px] font-[650] tracking-[-.02em]">
                        {pct}%
                      </span>
                      <span className="text-[11.5px] text-[var(--text-3)]">
                        {closed}/{total} done
                      </span>
                    </div>
                    <div className="h-[7px] w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{
                          width: `${pct}%`,
                          background: pct === 100 ? "#16a34a" : "var(--brand)",
                        }}
                      />
                    </div>
                  </div>
                  {/* Secondary action, so it gets a small explicit target with a
                      VISIBLE word — an icon alone wasn't discoverable, which is
                      half of what GH #17 was about. stopPropagation is
                      load-bearing: without it this also toggles the row. */}
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      openDetail(e.id);
                    }}
                    aria-label={`Open details for ${e.id}`}
                    title={`Open details for ${e.id}`}
                    className="flex h-7 flex-shrink-0 items-center gap-[5px] rounded-[8px] border border-border bg-[var(--surface-2)] px-[9px] text-[11.5px] font-[550] text-[var(--text-2)] hover:border-[var(--brand)] hover:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                  >
                    <Icon name="list" size={12} className="flex-shrink-0" />
                    <span>Details</span>
                  </button>
                  {/* Redundant mouse convenience for the row's own toggle. The
                      row carries aria-expanded, so this is aria-hidden and out
                      of the tab order — two elements announcing the same
                      expanded state is a screen-reader annoyance. Stays a
                      <button> inside a role="button" div, never a real
                      <button>, per a3c1328 / GH #10. */}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setExpanded((st) => ({ ...st, [e.id]: !isOpen }));
                    }}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]"
                  >
                    <Icon
                      name="chevron"
                      size={18}
                      className="transition-transform"
                      style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                    />
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-border bg-[var(--surface-2)] p-[6px]">
                    {kids.map((k) => {
                      const o = beadOrigin(k, humanAllowlist);
                      return (
                        <div
                          key={k.id}
                          onClick={() => openDetail(k.id)}
                          className="flex cursor-pointer items-center gap-[11px] rounded-[9px] p-[9px_12px] hover:bg-[var(--surface)]"
                        >
                          <span
                            className="h-2 w-2 flex-shrink-0 rounded-full"
                            style={{ background: catColor(k.status) }}
                          />
                          <span className="w-[74px] flex-shrink-0 font-mono text-[11px] text-[var(--text-3)]">
                            {k.id}
                          </span>
                          <Icon
                            name={typeIconName(k.issue_type)}
                            size={14}
                            className="flex-shrink-0"
                            style={{ color: typeColor(k.issue_type) }}
                          />
                          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium">
                            {k.title}
                          </span>
                          <LabelChips labels={k.labels ?? []} max={2} />
                          <PriorityChip p={k.priority} />
                          <OriginBadge origin={o} title={originTitle(k.created_by, o)} />
                          <span
                            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white"
                            style={{ background: avatarColor(k.assignee ?? "") }}
                          >
                            {initials(k.assignee ?? "")}
                          </span>
                        </div>
                      );
                    })}
                    <button
                      disabled={readOnly}
          onClick={() => openCreate({ parent: e.id })}
                      className="m-[2px] flex w-[calc(100%-4px)] items-center gap-[7px] rounded-[9px] p-[9px_12px] text-[12.5px] font-[550] text-[var(--brand)] hover:bg-[var(--surface)]"
                    >
                      <Icon name="plus" size={14} />
                      <span>Add child to this epic</span>
                    </button>
                  </div>
                )}
              </section>
            );
          })}
          {epics.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-border p-10 text-center text-[13px] text-[var(--text-3)]">
              No epics yet. Create one with type “epic”.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const c = catColor(status);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-px text-[10.5px] font-semibold tracking-[.01em]"
      style={{ color: c, background: `${c}1c`, border: `1px solid ${c}33` }}
    >
      {statusLabel(status)}
    </span>
  );
}
