"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { Icon, typeIconName } from "@/components/icons";
import { PriorityChip } from "@/components/board/bead-card";
import { isBlocked, blockingDeps, relTime, fmtDateTime, typeColor, catColor } from "@/lib/beads-view";
import type { Bead } from "@/lib/schema";

/**
 * Focus — "what's happening now". Three fixed columns cut by status × priority:
 *
 *   In flight — in_progress or hooked (work claimed or attached to an agent)
 *   Blocked   — blocked status, or open with an unresolved blocking dep
 *   Next up   — open, unblocked, P0/P1 only
 *
 * Recently finished work can be shown as an optional fourth column.
 * Everything else (the deep ready pool, P2+ backlog) stays behind
 * the Board/List views — that's the point: an optional screen that answers
 * "what's in flight, what's stuck, what would I pick up next" without scrolling.
 *
 * Lane chips: when SCOTTY_LANE_PREFIX is set (e.g. "ctx:"), one chip per lane
 * label found on the visible beads filters all three columns — a one-click
 * "show me this lane's now". Unset → no chips.
 */

const ARCHIVED = "archived";
const RECENT_LIMIT = 7;
type FocusColumn = { id: string; title: string; hint: string; items: Bead[] };

function completionDate(bead: Bead): string | undefined {
  // Invalid/missing completion dates fall back to the last known update.
  const closed = Date.parse(bead.closed_at || "");
  if (Number.isFinite(closed)) return bead.closed_at || undefined;
  const updated = Date.parse(bead.updated_at || "");
  return Number.isFinite(updated) ? bead.updated_at : undefined;
}

function completionTime(bead: Bead): number {
  return Date.parse(completionDate(bead) || "") || 0;
}

function assigneeKey(bead: Bead): string {
  // Prefix real names so no name can collide with the blank-assignee sentinel.
  return bead.assignee?.trim() ? `person:${bead.assignee.trim()}` : "none";
}

function assigneeGroups(columns: FocusColumn[]) {
  const groups = new Map<string, { key: string; label: string; columns: FocusColumn[]; active: boolean }>();
  for (const [columnIndex, column] of columns.entries()) {
    for (const bead of column.items) {
      const key = assigneeKey(bead);
      let group = groups.get(key);
      if (!group) {
        group = { key, label: bead.assignee?.trim() || "No assignee",
          columns: columns.map(c => ({ ...c, items: [] })), active: false };
        groups.set(key, group);
      }
      group.columns[columnIndex].items.push(bead);
      group.active ||= column.id === "flight";
    }
  }
  return [...groups.values()].sort((a, b) =>
    Number(a.key === "none") - Number(b.key === "none") ||
    Number(b.active) - Number(a.active) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

function laneOf(b: Bead, prefix: string): string | null {
  const l = (b.labels ?? []).find((x) => x.startsWith(prefix));
  return l ? l.slice(prefix.length) : null;
}

export function FocusView() {
  const { beads, index, meta } = useApp();
  const prefix = meta?.lanePrefix ?? null;
  const [groupBy, setGroupBy] = React.useState<"none" | "assignee">("none");
  const [showRecent, setShowRecent] = React.useState(false);
  const [showAllRecent, setShowAllRecent] = React.useState(false);
  const [lane, setLane] = React.useState<string | null>(null); // null = all, "" = unlabeled

  const active = React.useMemo(
    () => beads.filter((b) => !(b.labels ?? []).includes(ARCHIVED)),
    [beads],
  );

  const lanes = React.useMemo(() => {
    if (!prefix) return [];
    const s = new Set<string>();
    for (const b of active) {
      if (!["in_progress", "hooked", "blocked", "open"].includes(b.status) && !(showRecent && b.status === "closed")) continue;
      const l = laneOf(b, prefix);
      if (l) s.add(l);
    }
    return [...s].sort();
  }, [active, prefix, showRecent]);

  // A live update can remove the selected lane. Fall back to All so the
  // hidden filter cannot strand the user on an empty screen.
  const selectedLane = lane && !lanes.includes(lane) ? null : lane;

  const inLane = React.useCallback(
    (b: Bead) => {
      if (!prefix || selectedLane === null) return true;
      const l = laneOf(b, prefix);
      return selectedLane === "" ? l === null : l === selectedLane;
    },
    [prefix, selectedLane],
  );

  const inFlight = React.useMemo(
    () => active.filter((b) => (b.status === "in_progress" || b.status === "hooked") && inLane(b)),
    [active, inLane],
  );
  const blocked = React.useMemo(
    () => active.filter((b) => isBlocked(b, index) && inLane(b)),
    [active, index, inLane],
  );
  const nextUp = React.useMemo(
    () =>
      active.filter(
        (b) => b.status === "open" && b.priority <= 1 && !isBlocked(b, index) && inLane(b),
      ),
    [active, index, inLane],
  );

  const recentlyFinished = active.filter(b => b.status === "closed" && inLane(b))
    .sort((a, b) => completionTime(b) - completionTime(a) || a.id.localeCompare(b.id));
  const recentItems = showAllRecent ? recentlyFinished : recentlyFinished.slice(0, RECENT_LIMIT);
  const columns: FocusColumn[] = [
    { id: "flight", title: "In flight", hint: "in progress or hooked", items: inFlight },
    { id: "blocked", title: "Blocked", hint: "waiting on a dependency or marked blocked", items: blocked },
    { id: "next", title: "Next up", hint: "ready · P0/P1", items: nextUp },
    ...(showRecent ? [{ id: "recent", title: "Recently finished", hint: "latest completions", items: recentItems }] : []),
  ];
  const groups = groupBy === "assignee" ? assigneeGroups(columns) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="mr-1 flex flex-col gap-px">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Focus</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            what&rsquo;s happening now · {inFlight.length} in flight · {blocked.length} blocked ·{" "}
            {nextUp.length} next up
          </span>
        </div>
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-[12px] text-[var(--text-2)]">
          Group by
          <select value={groupBy} onChange={e => setGroupBy(e.target.value === "assignee" ? "assignee" : "none")}
            className="h-8 rounded-[8px] border border-border bg-[var(--surface-2)] px-2 text-[var(--text)]">
            <option value="none">None</option>
            <option value="assignee">Assignee</option>
          </select>
        </label>
        <button aria-pressed={showRecent} onClick={() => { setShowRecent(!showRecent); setShowAllRecent(false); }}
          className="h-8 rounded-[8px] border border-border px-3 text-[12px] aria-pressed:border-[var(--brand)] aria-pressed:bg-[var(--brand-weak)] aria-pressed:text-[var(--brand)]">
          Recently finished
        </button>
        {prefix && lanes.length > 0 && (
          <div className="flex flex-wrap items-center gap-[6px]">
            <LaneChip label="All" selected={selectedLane === null} onClick={() => setLane(null)} />
            {lanes.map((l) => (
              <LaneChip
                key={l}
                label={l}
                selected={selectedLane === l}
                onClick={() => setLane(selectedLane === l ? null : l)}
              />
            ))}
            <LaneChip
              label="unlabeled"
              selected={selectedLane === ""}
              onClick={() => setLane(selectedLane === "" ? null : "")}
            />
          </div>
        )}
      </header>

      {showRecent && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border px-[22px] py-2 text-[12px] text-[var(--text-2)]">
          <span aria-live="polite">Showing {recentItems.length} of {recentlyFinished.length} completed beads</span>
          {recentlyFinished.length > RECENT_LIMIT && (
            <button onClick={() => setShowAllRecent(!showAllRecent)} className="rounded px-2 py-1 font-medium text-[var(--brand)] hover:bg-[var(--brand-weak)]">
              {showAllRecent ? `Show latest ${RECENT_LIMIT}` : `Show all ${recentlyFinished.length} completed`}
            </button>
          )}
          <span className="text-[var(--text-3)]">Current lane filter applies. Active and blocked work is always shown in full.</span>
        </div>
      )}
      {groupBy === "none" ? (
        <div className="bd-scroll min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-[18px_22px]">
          <div className="flex h-full min-h-0 gap-4">
            {columns.map(c => <FocusColumnView key={c.id} column={c} />)}
          </div>
        </div>
      ) : (
        <div className="bd-scroll min-h-0 flex-1 overflow-auto p-[18px_22px]">
          {groups.length === 0 ? <p className="p-4 text-[13px] text-[var(--text-3)]">No matching work. Try another lane or include recently finished work.</p> : (
            <div className="min-w-max">
              <div className="sticky top-0 z-10 mb-2 flex gap-4 bg-[var(--bg)] py-2" aria-hidden="true">
                <div className="w-[160px] shrink-0 text-[12px] font-medium text-[var(--text-3)]">Assignee</div>
                {columns.map(c => <div key={c.id} className="w-[280px] shrink-0 text-[13px] font-semibold">{c.title} <span className="font-normal text-[var(--text-3)]">· {c.items.length}</span></div>)}
              </div>
              {groups.map(group => (
                <section key={group.key} aria-label={`Assignee: ${group.label}`} className="flex gap-4 border-t border-border py-4">
                  <div className="w-[160px] shrink-0">
                    <h2 className="break-words text-[13px] font-semibold">{group.label}</h2>
                    <p className="mt-1 text-[11px] text-[var(--text-3)]">{group.key === "none" ? "Not assigned" : "Assigned work"} · {group.columns.reduce((n, c) => n + c.items.length, 0)}</p>
                  </div>
                  {group.columns.map(c => <FocusColumnView key={c.id} column={c} grouped />)}
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FocusColumnView({ column, grouped = false }: { column: FocusColumn; grouped?: boolean }) {
  return (
    <section data-focus-column={column.id} aria-label={grouped ? column.title : undefined}
      className={grouped ? "w-[280px] shrink-0" : "flex h-full min-h-0 w-[320px] shrink-0 flex-col"}>
      {!grouped && <div className="mb-2 flex flex-wrap items-baseline gap-2 px-1">
        <h2 className="m-0 text-[13px] font-[650] text-[var(--text)]">{column.title}</h2>
        <span className="text-[11px] text-[var(--text-3)]">{column.items.length} · {column.hint}</span>
      </div>}
      <div className={`rounded-[12px] border border-border bg-[var(--surface-2)] p-2 ${grouped ? "min-h-[70px]" : "bd-scroll min-h-0 flex-1 overflow-y-auto"}`}>
        {column.items.length === 0 ? <div className="p-4 text-center text-[12px] text-[var(--text-3)]">Nothing here.</div> : (
          <div className="flex flex-col gap-2">{column.items.map(b => (
            <FocusCard key={b.id} bead={b} showBlockers={column.id === "blocked"} />
          ))}</div>
        )}
      </div>
    </section>
  );
}

function LaneChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      onClick={onClick}
      className="rounded-full border px-[10px] py-[3px] text-[11.5px] font-[550] transition-colors"
      style={
        selected
          ? { borderColor: "var(--brand)", background: "var(--brand-weak)", color: "var(--brand)" }
          : { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-2)" }
      }
    >
      {label}
    </button>
  );
}

function FocusCard({ bead, showBlockers }: { bead: Bead; showBlockers?: boolean }) {
  const { index, openDetail, selectedBeadId, selectBead } = useApp();
  const blockers = showBlockers ? blockingDeps(bead, index) : [];
  const timestamp = bead.status === "closed" ? completionDate(bead) : bead.updated_at;
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={bead.title}
      data-keyboard-bead-id={bead.id}
      aria-current={selectedBeadId === bead.id ? "true" : undefined}
      onFocus={() => selectBead(bead.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetail(bead.id);
        }
      }}
      onClick={() => {
        selectBead(bead.id);
        openDetail(bead.id);
      }}
      className={`cursor-pointer rounded-[11px] border bg-[var(--surface)] p-[10px_12px] shadow-[var(--shadow)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)] focus-visible:outline-none ${
        selectedBeadId === bead.id
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
          : "border-border"
      }`}
    >
      <div className="mb-[5px] flex items-center gap-[7px]">
        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: catColor(bead.status) }} />
        <span className="font-mono text-[10.5px] text-[var(--text-3)]">{bead.id}</span>
        <span className="flex-1" />
        <PriorityChip p={bead.priority} />
        <Icon
          name={typeIconName(bead.issue_type)}
          size={13}
          style={{ color: typeColor(bead.issue_type) }}
        />
      </div>
      <div className="text-[12.5px] font-[550] leading-[1.35] text-[var(--text)] [text-wrap:pretty]">
        {bead.title}
      </div>
      <div className="mt-[6px] flex items-center gap-[8px] text-[10.5px] text-[var(--text-3)]">
        <span title={fmtDateTime(timestamp)}>{relTime(timestamp)}</span>
        {blockers.length > 0 && (
          <span className="truncate font-mono" title={`blocked by ${blockers.join(", ")}`}>
            ⛔ {blockers.join(", ")}
          </span>
        )}
      </div>
    </article>
  );
}
