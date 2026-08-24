"use client";
import * as React from "react";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import {
  isBlocked,
  blockingDeps,
  avatarColor,
  initials,
  relTime,
  prioColor,
  prioLabel,
} from "@/lib/beads-view";
import { cn } from "@/lib/utils";
import type { Bead } from "@/lib/schema";

/**
 * A deliberately small window: agents rarely work more than a handful of
 * beads at a time, so the whole view should stay around ~20 cards.
 */
const DONE_CAP = 7;
const NEXT_CAP = 7;

type Band = "done" | "active" | "next";

const BANDS: { id: Band; name: string; color: string }[] = [
  { id: "done", name: "Just finished", color: "#16a34a" },
  { id: "active", name: "Active", color: "#d97706" },
  { id: "next", name: "Next up", color: "#3b82f6" },
];

/**
 * Visual state of a single bead — color + icon + label together, so state is
 * never encoded by color alone.
 */
type BeadState = "closed" | "active" | "hooked" | "blocked" | "ready";

const STATES: Record<BeadState, { color: string; icon: string; label: string; pulse?: boolean }> = {
  closed: { color: "#16a34a", icon: "check", label: "done" },
  active: { color: "#d97706", icon: "pencil", label: "in progress", pulse: true },
  hooked: { color: "#8b5cf6", icon: "link", label: "hooked", pulse: true },
  blocked: { color: "#ef4444", icon: "gate", label: "blocked" },
  ready: { color: "#3b82f6", icon: "task", label: "ready" },
};

const UNASSIGNED = "Unassigned";

function closedStamp(b: Bead): number {
  const t = Date.parse(b.closed_at || b.updated_at || "");
  return Number.isFinite(t) ? t : 0;
}

function updatedStamp(b: Bead): number {
  const t = Date.parse(b.updated_at || "");
  return Number.isFinite(t) ? t : 0;
}

function stateOf(b: Bead, index: Map<string, Bead>): BeadState {
  if (b.status === "closed") return "closed";
  if (b.status === "hooked") return "hooked";
  if (isBlocked(b, index)) return "blocked";
  return b.status === "in_progress" ? "active" : "ready";
}

function MiniCard({ bead }: { bead: Bead }) {
  const { index, openDetail } = useApp();
  const state = stateOf(bead, index);
  const st = STATES[state];
  const blockers = state === "blocked" ? blockingDeps(bead, index) : [];

  return (
    <button
      onClick={() => openDetail(bead.id)}
      className={cn(
        "w-full rounded-[10px] bg-[var(--surface)] p-[8px_10px_8px_12px] text-left shadow-[var(--shadow)] transition-[border-color,box-shadow] hover:shadow-[var(--shadow-lg)]",
        state === "blocked" ? "border-[1.5px] border-dashed" : "border border-border",
      )}
      style={{
        borderColor: state === "blocked" ? st.color : undefined,
        boxShadow: `inset 4px 0 0 ${st.color}, var(--shadow)`,
      }}
    >
      <div className="flex items-center gap-[6px]">
        <span
          className="flex items-center gap-[4px] rounded-full px-[7px] py-[2px] text-[10px] font-semibold text-white"
          style={{ background: st.color }}
        >
          <Icon name={st.icon} size={10} className={st.pulse ? "animate-pulse" : undefined} />
          {st.label}
        </span>
        <span className="font-mono text-[10.5px] text-[var(--text-3)]">{bead.id}</span>
        <span className="flex-1" />
        <span className="text-[10px] font-semibold" style={{ color: prioColor(bead.priority) }}>
          {prioLabel(bead.priority)}
        </span>
      </div>
      <div className="mt-[5px] line-clamp-2 text-[12px] font-[550] leading-[1.35] text-[var(--text)]">
        {bead.title}
      </div>
      <div className="mt-[5px] flex items-center gap-[6px] text-[10.5px] text-[var(--text-3)]">
        <span>{relTime(bead.status === "closed" ? bead.closed_at || bead.updated_at : bead.updated_at)}</span>
        {blockers.length > 0 && (
          <span
            className="rounded-[6px] px-[6px] py-px font-mono font-semibold"
            style={{ background: "color-mix(in srgb, #ef4444 14%, transparent)", color: "#ef4444" }}
          >
            ⊘ {blockers.join(", ")}
          </span>
        )}
      </div>
    </button>
  );
}

interface Lane {
  who: string;
  cells: Record<Band, Bead[]>;
  count: number;
  hasActive: boolean;
  latest: number;
}

export function FocusView() {
  const { beads, index, loading } = useApp();

  // Which vertical bands are visible. All on by default; toggling down to
  // just "Active" answers "what is being worked on right now".
  const [shown, setShown] = React.useState<Record<Band, boolean>>({
    done: true,
    active: true,
    next: true,
  });
  const toggle = (id: Band) => setShown((s) => ({ ...s, [id]: !s[id] }));

  const banded = React.useMemo((): Record<Band, Bead[]> => {
    const work = beads.filter(
      (b) => b.issue_type !== "epic" && !(b.labels ?? []).includes("archived"),
    );
    const open = work.filter((b) => b.status === "open");
    return {
      done: work
        .filter((b) => b.status === "closed")
        .sort((a, b) => closedStamp(b) - closedStamp(a))
        .slice(0, DONE_CAP),
      active: work
        .filter((b) => b.status === "in_progress" || b.status === "hooked")
        .sort((a, b) => updatedStamp(b) - updatedStamp(a)),
      // Top ready picks (same readiness as the board's Ready column: open and
      // unblocked, priority then recency) — plus every blocked open bead,
      // because stalled work is exactly what this view exists to surface.
      next: [
        ...open
          .filter((b) => !isBlocked(b, index))
          .sort((a, b) => a.priority - b.priority || updatedStamp(b) - updatedStamp(a))
          .slice(0, NEXT_CAP),
        ...open.filter((b) => isBlocked(b, index)),
      ],
    };
  }, [beads, index]);

  // One swimlane per assignee, one cell per band. Lanes with active work
  // float to the top (freshest first); Unassigned sinks to the bottom.
  const lanes = React.useMemo((): Lane[] => {
    const byWho = new Map<string, Lane>();
    for (const band of BANDS) {
      if (!shown[band.id]) continue;
      for (const bead of banded[band.id]) {
        const who = bead.assignee?.trim() || UNASSIGNED;
        let lane = byWho.get(who);
        if (!lane) {
          byWho.set(
            who,
            (lane = { who, cells: { done: [], active: [], next: [] }, count: 0, hasActive: false, latest: 0 }),
          );
        }
        lane.cells[band.id].push(bead);
        lane.count++;
        lane.hasActive ||= band.id === "active";
        lane.latest = Math.max(lane.latest, updatedStamp(bead));
      }
    }
    return [...byWho.values()].sort((a, b) => {
      if ((a.who === UNASSIGNED) !== (b.who === UNASSIGNED)) return a.who === UNASSIGNED ? 1 : -1;
      if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
      return b.latest - a.latest;
    });
  }, [banded, shown]);

  const visibleBands = BANDS.filter((b) => shown[b.id]);
  const shownCount = lanes.reduce((n, l) => n + l.count, 0);
  const gridCols = `168px repeat(${Math.max(visibleBands.length, 1)}, minmax(230px, 1fr))`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="mr-1 flex flex-col gap-px">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Focus</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {shownCount} beads · one lane per agent
          </span>
        </div>

        <span className="flex-1" />

        <div className="flex flex-shrink-0 items-center gap-[6px]">
          {BANDS.map((b) => (
            <button
              key={b.id}
              onClick={() => toggle(b.id)}
              aria-pressed={shown[b.id]}
              title={shown[b.id] ? `Hide ${b.name}` : `Show ${b.name}`}
              className={cn(
                "flex h-8 items-center gap-[7px] rounded-full border px-[12px] text-[12.5px] font-[550] transition-colors",
                shown[b.id]
                  ? "border-transparent bg-[var(--brand-weak)] text-[var(--brand)]"
                  : "border-border bg-[var(--surface-2)] text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-2)]",
              )}
            >
              <span
                className="h-[8px] w-[8px] rounded-[3px]"
                style={{ background: b.color, opacity: shown[b.id] ? 1 : 0.45 }}
              />
              <span>{b.name}</span>
              <span className="font-mono text-[11px] opacity-70">{banded[b.id].length}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="bd-scroll min-h-0 flex-1 overflow-auto p-[18px_22px]">
        {loading && beads.length === 0 ? (
          <div className="text-[13px] text-[var(--text-3)]">Loading beads…</div>
        ) : shownCount === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <Icon name="focus" size={28} className="text-[var(--text-3)]" />
              <div className="text-[13.5px] font-[550]">
                {visibleBands.length === 0 ? "All filters off" : "Nothing in flight"}
              </div>
              <div className="max-w-[300px] text-[12.5px] text-[var(--text-3)]">
                {visibleBands.length === 0
                  ? "Turn a filter back on to see beads."
                  : "Finished, active, and ready beads show up here as agents work."}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-x-4 gap-y-0" style={{ gridTemplateColumns: gridCols }}>
            {/* Band headers, sticky so long pages keep their bearings. */}
            <div className="sticky top-0 z-10 bg-[var(--bg)] pb-[10px]" />
            {visibleBands.map((b) => (
              <div
                key={b.id}
                className="sticky top-0 z-10 flex items-center gap-2 bg-[var(--bg)] px-1 pb-[10px]"
              >
                <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: b.color }} />
                <span className="text-[13px] font-semibold tracking-[-.005em]">{b.name}</span>
              </div>
            ))}

            {lanes.map((lane) => (
              <React.Fragment key={lane.who}>
                <div className="flex items-start gap-[8px] border-t border-border py-[14px] pr-2">
                  <div
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                    style={{ background: avatarColor(lane.who) }}
                  >
                    {lane.who === UNASSIGNED ? "?" : initials(lane.who)}
                  </div>
                  <div className="min-w-0 leading-[1.2]">
                    <div className="truncate text-[12.5px] font-semibold">{lane.who}</div>
                    <div className="font-mono text-[10.5px] text-[var(--text-3)]">
                      {lane.count} bead{lane.count === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                {visibleBands.map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-col gap-[8px] border-t border-border px-1 py-[14px]"
                  >
                    {lane.cells[b.id].map((bead) => (
                      <MiniCard key={bead.id} bead={bead} />
                    ))}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
