"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { useActivity } from "@/hooks/use-beads";
import { OriginBadge } from "@/components/board/bead-card";
import { Icon } from "@/components/icons";
import { avatarColor, initials, relTime, fmtDateTime } from "@/lib/beads-view";
import { BOARD_COLUMNS, colOf, type BoardColumn } from "@/lib/board-columns";
import { toggleStr } from "@/lib/filters";
import { useUrlState } from "@/hooks/use-url-state";
import {
  activityFiltersFromParams,
  emptyActivityFilters,
  filterActivity,
  freshness,
  hasActivityFilters,
  isArchived,
  summarizeAgents,
  summarizePipeline,
  writeActivityFilters,
  type ActivityFilters,
} from "@/lib/activity-filters";
import {
  AgentCard,
  AgentsHelp,
  PipelineCard,
  PipelineHelp,
  RowHeader,
  StageArrow,
} from "@/components/activity/activity-filter-rows";

/** The stages the Pipeline row shows: the Board's own columns, in order. */
function pipelineColumns(): BoardColumn[] {
  return BOARD_COLUMNS;
}

/** Re-render every 30 s so the agents' freshness dots and times stay current. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * Mission Control — live activity feed. A newest-first stream of what humans and
 * agents did (created / claimed / closed / re-prioritized / commented), each
 * stamped 👤/🤖 and linking to the bead. Data comes from /activity, refreshed
 * live by the SSE change stream (see useBeadsStream).
 *
 * Above the feed, an Agents row and a Pipeline row double as filters: each card
 * toggles on click. Actors OR together, stages OR together, the two groups AND.
 * The selection lives in `?actor=` / `?stage=` (see lib/activity-filters.ts).
 */
export function ActivityView() {
  const { projectId, openDetail, selectedBeadId, selectBead, beads, index } = useApp();
  const { data, isLoading } = useActivity(projectId);
  const allItems = React.useMemo(() => data?.items ?? [], [data]);
  const now = useNow();

  const columns = pipelineColumns();
  const stageIds = React.useMemo(() => columns.map((c) => c.id), [columns]);
  const { searchParams, updateUrl } = useUrlState();
  const filters = React.useMemo(
    () => activityFiltersFromParams(searchParams, stageIds),
    [searchParams, stageIds],
  );
  const filtering = hasActivityFilters(filters);

  // Read the selection from the live URL, not this render's props, so two quick
  // clicks never drop one (Next reflects history updates a render late).
  const setFilters = React.useCallback(
    (update: (f: ActivityFilters) => ActivityFilters) =>
      updateUrl((params) => {
        writeActivityFilters(params, update(activityFiltersFromParams(params, stageIds)));
      }),
    [updateUrl, stageIds],
  );
  const toggleActor = (actor: string) =>
    setFilters((f) => ({ ...f, actors: toggleStr(f.actors, actor) }));
  const toggleStage = (stage: string) =>
    setFilters((f) => ({ ...f, stages: toggleStr(f.stages, stage) }));
  const clearFilters = () => setFilters(() => emptyActivityFilters);

  const agents = React.useMemo(() => summarizeAgents(allItems), [allItems]);
  const pipeline = React.useMemo(
    () => summarizePipeline(beads, stageIds, (b) => colOf(b, index)),
    [beads, stageIds, index],
  );
  const items = React.useMemo(
    () =>
      // Same beads as the Pipeline counts: an archived or deleted bead has no stage.
      filterActivity(allItems, filters, (id) => {
        const b = index.get(id);
        return b && !isArchived(b) ? colOf(b, index) : null;
      }),
    [allItems, filters, index],
  );
  const activeNow = agents.filter((a) => freshness(a.last.at, now) === "active").length;
  const columnName = (id: string) => columns.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Icon name="comment" size={18} className="text-[var(--text-2)]" />
        <h1 className="text-[15px] font-[650]">Activity</h1>
        <span className="text-[12px] text-[var(--text-3)]">
          · what humans and agents did, newest first
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {(agents.length > 0 || beads.length > 0) && (
          <section aria-label="Activity filters" className="flex flex-col gap-4 border-b border-border px-6 py-4">
            {agents.length > 0 && (
              <div>
                <RowHeader
                  label="Agents"
                  help={<AgentsHelp />}
                  aside={`${activeNow} active now`}
                />
                <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 pt-[2px]">
                  {agents.map((a) => (
                    <AgentCard
                      key={a.actor}
                      agent={a}
                      now={now}
                      selected={filters.actors.includes(a.actor)}
                      dimmed={filters.actors.length > 0 && !filters.actors.includes(a.actor)}
                      onToggle={() => toggleActor(a.actor)}
                    />
                  ))}
                </div>
              </div>
            )}
            {beads.length > 0 && (
              <div>
                <RowHeader
                  label="Pipeline"
                  help={<PipelineHelp />}
                  aside={filtering ? `${items.length} of ${allItems.length} events` : `${allItems.length} events`}
                />
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pt-[2px]">
                  {columns.map((c, i) => {
                    const stage = pipeline[i];
                    return (
                      <React.Fragment key={c.id}>
                        {i > 0 && <StageArrow />}
                        <PipelineCard
                          column={c}
                          stage={stage}
                          selected={filters.stages.includes(c.id)}
                          dimmed={filters.stages.length > 0 && !filters.stages.includes(c.id)}
                          onToggle={() => toggleStage(c.id)}
                        />
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
        {filtering && !(isLoading && allItems.length === 0) && (
          <div data-activity-chips className="mx-auto flex max-w-3xl flex-wrap items-center gap-[6px] px-4 pt-3">
            <span className="text-[12px] text-[var(--text-3)]">Showing</span>
            {filters.actors.map((a) => (
              <FilterChip key={`a:${a}`} label={a} onRemove={() => toggleActor(a)} />
            ))}
            {filters.stages.map((s) => (
              <FilterChip key={`s:${s}`} label={columnName(s)} onRemove={() => toggleStage(s)} />
            ))}
            <button
              type="button"
              onClick={clearFilters}
              className="ml-1 text-[12px] font-medium text-[var(--text-2)] underline-offset-2 hover:underline"
            >
              Clear
            </button>
          </div>
        )}
        <div className="px-4 py-3">
          {isLoading && allItems.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[var(--text-3)]">Loading activity…</div>
          ) : allItems.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[var(--text-3)]">No activity yet.</div>
          ) : items.length === 0 ? (
            <div data-activity-empty className="flex flex-col items-center gap-2 p-10 text-center">
              <div className="text-[13.5px] font-semibold">No activity matches your filters</div>
              <div className="text-[12.5px] text-[var(--text-3)]">
                Remove a filter, or clear them to see every event.
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-1 flex h-8 items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[11px] text-[12.5px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)]"
              >
                <Icon name="x" size={14} />
                Clear filters
              </button>
            </div>
          ) : (
            <ol className="mx-auto flex max-w-3xl flex-col">
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    data-activity-event={it.id}
                    data-keyboard-bead-id={it.issueId}
                    aria-current={selectedBeadId === it.issueId ? "true" : undefined}
                    onFocus={() => selectBead(it.issueId)}
                    onClick={() => {
                      selectBead(it.issueId);
                      openDetail(it.issueId);
                    }}
                    className={`flex w-full items-start gap-3 rounded-[10px] px-3 py-[10px] text-left hover:bg-[var(--surface-2)] focus-visible:outline-none ${
                      selectedBeadId === it.issueId ? "ring-2 ring-inset ring-[var(--brand)]" : ""
                    }`}
                  >
                    <span
                      className="mt-[1px] flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{ background: avatarColor(it.actor) }}
                    >
                      {initials(it.actor)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-[6px] gap-y-1 text-[13px]">
                        <span className="font-semibold">{it.actor}</span>
                        <OriginBadge origin={it.origin} title={it.origin === "human" ? "Human" : "Agent"} />
                        <span className="text-[var(--text-2)]">{it.action}</span>
                        <span className="font-mono text-[11px] text-[var(--text-3)]">{it.issueId}</span>
                      </div>
                      <div className="truncate text-[12.5px] text-[var(--text-2)]">{it.title}</div>
                      {it.detail && (
                        <div className="truncate text-[12px] text-[var(--text-3)]">{it.detail}</div>
                      )}
                    </div>
                    <span
                      title={fmtDateTime(it.at)}
                      className="flex-shrink-0 whitespace-nowrap text-[11px] text-[var(--text-3)]"
                    >
                      {relTime(it.at)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-[4px] rounded-md border border-[var(--brand)] bg-[var(--brand-weak)] py-[2px] pl-[8px] pr-[3px] text-[12px] font-medium text-[var(--brand)]">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="flex h-[16px] w-[16px] items-center justify-center rounded hover:bg-[var(--brand)]/15"
      >
        <Icon name="x" size={11} />
      </button>
    </span>
  );
}
