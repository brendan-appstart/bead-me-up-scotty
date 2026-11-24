"use client";
import * as React from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { OriginBadge } from "@/components/board/bead-card";
import { Icon } from "@/components/icons";
import { avatarColor, initials, relTime, fmtDateTime } from "@/lib/beads-view";
import type { BoardColumn } from "@/lib/board-columns";
import {
  freshness,
  type AgentSummary,
  type Freshness,
  type StageSummary,
} from "@/lib/activity-filters";

/**
 * The two filter rows above the Activity feed: one card per actor, one card per
 * board stage. Every card is a toggle (aria-pressed); the view decides what a
 * selection means. Cards reuse the bead card's surface, border and ring.
 */

const FRESHNESS: Record<Freshness, { color: string; label: string }> = {
  active: { color: "#16a34a", label: "Active in the last 5 minutes" },
  quiet: { color: "#d97706", label: "Quiet (5 to 30 minutes)" },
  silent: { color: "#ef4444", label: "Silent (30+ minutes)" },
};

function cardClass(selected: boolean, dimmed: boolean): string {
  return [
    "flex flex-col gap-[6px] rounded-[11px] border bg-[var(--surface)] p-[12px_13px] text-left shadow-[var(--shadow)]",
    "transition-[opacity,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
    selected
      ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
      : "border-border hover:border-[var(--text-3)]",
    dimmed ? "opacity-60 hover:opacity-100" : "",
  ].join(" ");
}

export function RowHeader({
  label,
  help,
  aside,
}: {
  label: string;
  /** Rich help, shown in a popover on hover or keyboard focus of the "?". */
  help: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-[8px] flex items-center gap-[6px]">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">{label}</span>
      <Tooltip.Root>
        <Tooltip.Trigger
          delay={150}
          aria-label={`About the ${label} row`}
          className="flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full border border-border text-[9.5px] font-semibold text-[var(--text-3)] hover:text-[var(--text-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
        >
          ?
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
            <Tooltip.Popup
              data-activity-help={label}
              className="flex w-[290px] flex-col gap-[8px] rounded-[10px] border border-border bg-[var(--surface)] p-[12px_14px] text-[12.5px] leading-[1.5] text-[var(--text-2)] shadow-[var(--shadow-lg)]"
            >
              {help}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      {aside && <span className="ml-auto text-[11.5px] text-[var(--text-3)]">{aside}</span>}
    </div>
  );
}

function HelpTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-semibold text-[var(--text)]">{children}</div>;
}

export function AgentsHelp() {
  return (
    <>
      <HelpTitle>How this row is built</HelpTitle>
      <p>One card per person or agent who acted on a bead, most recent first, with their latest action.</p>
      <ul className="flex flex-col gap-[3px]">
        {(Object.keys(FRESHNESS) as Freshness[]).map((k) => (
          <li key={k} className="flex items-center gap-[7px]">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: FRESHNESS[k].color }} />
            {FRESHNESS[k].label}
          </li>
        ))}
      </ul>
      <p>
        Click a card to show only that actor&apos;s events; click it again to remove the filter. Select
        several actors to see all of them.
      </p>
    </>
  );
}

export function PipelineHelp() {
  return (
    <>
      <HelpTitle>How the pipeline works</HelpTitle>
      <p>Each card is a Board column. The count is how many beads sit in it right now, epics included and archived beads left out.</p>
      <p>
        Click a column to show only events on beads currently in it; click it again to remove the
        filter. Several columns can be selected.
      </p>
      <p>With agents selected too, an event must match both an agent and a column.</p>
    </>
  );
}

export function AgentCard({
  agent,
  now,
  selected,
  dimmed,
  onToggle,
}: {
  agent: AgentSummary;
  now: number;
  selected: boolean;
  dimmed: boolean;
  onToggle: () => void;
}) {
  const fresh = FRESHNESS[freshness(agent.last.at, now)];
  const { last } = agent;
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-activity-actor={agent.actor}
      onClick={onToggle}
      title={selected ? `Stop filtering by ${agent.actor}` : `Show only ${agent.actor}'s activity`}
      className={`${cardClass(selected, dimmed)} w-[236px] flex-shrink-0`}
    >
      <div className="flex min-w-0 items-center gap-[7px]">
        <span
          title={fresh.label}
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ background: fresh.color }}
        />
        <span
          className="flex h-[19px] w-[19px] flex-shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white"
          style={{ background: avatarColor(agent.actor) }}
        >
          {initials(agent.actor)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{agent.actor}</span>
        <OriginBadge origin={agent.origin} title={agent.origin === "human" ? "Human" : "Agent"} />
      </div>
      <span className="font-mono text-[11.5px] text-[var(--text-3)]">{last.issueId}</span>
      <span className="truncate text-[12px] text-[var(--text-2)]">
        {last.action} · {last.title}
      </span>
      <span title={fmtDateTime(last.at)} className="text-[11px] text-[var(--text-3)]">
        {relTime(last.at, new Date(now))}
      </span>
    </button>
  );
}

export function PipelineCard({
  column,
  stage,
  selected,
  dimmed,
  onToggle,
}: {
  column: BoardColumn;
  stage: StageSummary;
  selected: boolean;
  dimmed: boolean;
  onToggle: () => void;
}) {
  const breakdown = [
    stage.tasks > 0 ? `${stage.tasks} ${stage.tasks === 1 ? "task" : "tasks"}` : "",
    stage.epics > 0 ? `${stage.epics} ${stage.epics === 1 ? "epic" : "epics"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-activity-stage={column.id}
      onClick={onToggle}
      title={selected ? `Stop filtering by ${column.name}` : `Show only activity on ${column.name} beads`}
      className={`${cardClass(selected, dimmed)} min-h-[132px] w-[168px] flex-shrink-0`}
    >
      <div className="flex items-center gap-[7px]">
        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: column.color }} />
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: column.color }}>
          {column.name}
        </span>
      </div>
      <span className="text-[24px] font-[650] leading-none">{stage.count}</span>
      {breakdown && <span className="text-[11.5px] text-[var(--text-3)]">{breakdown}</span>}
      {stage.ids.length > 0 && (
        <span className="flex flex-col font-mono text-[11px] leading-[1.6] text-[var(--text-3)]">
          {stage.ids.map((id) => (
            <span key={id} className="truncate">
              {id}
            </span>
          ))}
          {stage.more > 0 && <span className="font-sans">+{stage.more} more</span>}
        </span>
      )}
    </button>
  );
}

export function StageArrow() {
  return (
    <span aria-hidden className="flex flex-shrink-0 items-center text-[var(--text-3)]">
      <Icon name="chevron" size={14} className="-rotate-90" />
    </span>
  );
}
