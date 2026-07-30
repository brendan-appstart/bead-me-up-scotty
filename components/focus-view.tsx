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
 *   In flight — in_progress (the threads someone has actually claimed)
 *   Blocked   — blocked status, or open with an unresolved blocking dep
 *   Next up   — open, unblocked, P0/P1 only
 *
 * Everything else (the deep ready pool, P2+ backlog, closed work) stays behind
 * the Board/List views — that's the point: an optional screen that answers
 * "what's in flight, what's stuck, what would I pick up next" without scrolling.
 *
 * Lane chips: when SCOTTY_LANE_PREFIX is set (e.g. "ctx:"), one chip per lane
 * label found on the visible beads filters all three columns — a one-click
 * "show me this lane's now". Unset → no chips.
 */

const ARCHIVED = "archived";

function laneOf(b: Bead, prefix: string): string | null {
  const l = (b.labels ?? []).find((x) => x.startsWith(prefix));
  return l ? l.slice(prefix.length) : null;
}

export function FocusView() {
  const { beads, index, meta } = useApp();
  const prefix = meta?.lanePrefix ?? null;
  const [lane, setLane] = React.useState<string | null>(null); // null = all, "" = unlabeled

  const active = React.useMemo(
    () => beads.filter((b) => !(b.labels ?? []).includes(ARCHIVED)),
    [beads],
  );

  const lanes = React.useMemo(() => {
    if (!prefix) return [];
    const s = new Set<string>();
    for (const b of active) {
      if (b.status !== "in_progress" && b.status !== "blocked" && b.status !== "open") continue;
      const l = laneOf(b, prefix);
      if (l) s.add(l);
    }
    return [...s].sort();
  }, [active, prefix]);

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
    () => active.filter((b) => b.status === "in_progress" && inLane(b)),
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

  const columns: { title: string; hint: string; items: Bead[] }[] = [
    { title: "In flight", hint: "in_progress", items: inFlight },
    { title: "Blocked", hint: "waiting on a dependency", items: blocked },
    { title: "Next up", hint: "ready · P0/P1", items: nextUp },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="mr-1 flex flex-col gap-px">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Focus</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            what&rsquo;s happening now · {inFlight.length} in flight · {blocked.length} blocked ·{" "}
            {nextUp.length} next up
          </span>
        </div>
        <span className="flex-1" />
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

      <div className="bd-scroll min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-[18px_22px]">
        <div className="flex h-full min-h-0 gap-4">
          {columns.map((c) => (
            <section key={c.title} className="flex h-full min-h-0 w-[320px] flex-shrink-0 flex-col">
              <div className="mb-2 flex items-baseline gap-2 px-1">
                <h2 className="m-0 text-[13px] font-[650] text-[var(--text)]">{c.title}</h2>
                <span className="text-[11px] text-[var(--text-3)]">
                  {c.items.length} · {c.hint}
                </span>
              </div>
              <div className="bd-scroll min-h-0 flex-1 overflow-y-auto rounded-[12px] border border-border bg-[var(--surface-2)] p-2">
                {c.items.length === 0 ? (
                  <div className="p-4 text-center text-[12px] text-[var(--text-3)]">Nothing here.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {c.items.map((b) => (
                      <FocusCard key={b.id} bead={b} showBlockers={c.title === "Blocked"} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
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
        <span title={fmtDateTime(bead.updated_at)}>{relTime(bead.updated_at)}</span>
        {blockers.length > 0 && (
          <span className="truncate font-mono" title={`blocked by ${blockers.join(", ")}`}>
            ⛔ {blockers.join(", ")}
          </span>
        )}
      </div>
    </article>
  );
}
