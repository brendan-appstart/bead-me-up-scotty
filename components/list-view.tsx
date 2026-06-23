"use client";
import * as React from "react";
import { Icon, typeIconName } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { PriorityChip, OriginBadge } from "@/components/board/bead-card";
import { FilterBar } from "@/components/filter-bar";
import { matchesFilters, emptyFilters, type Filters } from "@/lib/filters";
import { beadOrigin, originTitle } from "@/lib/attribution";
import {
  catColor,
  statusLabel,
  typeColor,
  avatarColor,
  initials,
  isBlocked,
  relTime,
} from "@/lib/beads-view";
import { type Bead } from "@/lib/schema";

export function ListView() {
  const { beads, index, humanAllowlist, openDetail, openCreate, loading } = useApp();
  const [filters, setFilters] = React.useState<Filters>(emptyFilters);
  const [showArchived, setShowArchived] = React.useState(false);

  const rows = React.useMemo(() => {
    return beads
      .filter((b) => {
        if (b.issue_type === "epic") return false;
        if (!showArchived && (b.labels ?? []).includes("archived")) return false;
        return matchesFilters(b, filters, humanAllowlist);
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      });
  }, [beads, filters, showArchived, humanAllowlist]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="mr-1 flex flex-col gap-px">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">List</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {rows.length} beads · sorted by priority
          </span>
        </div>

        <FilterBar
          filters={filters}
          onChange={setFilters}
          showArchived={showArchived}
          onShowArchived={setShowArchived}
        />

        <button
          onClick={() => openCreate()}
          className="flex h-9 flex-shrink-0 items-center gap-[6px] rounded-[9px] px-[14px] text-[13px] font-[550] text-white"
          style={{ background: "var(--brand)", boxShadow: "0 2px 8px -2px var(--brand)" }}
        >
          <Icon name="plus" size={15} />
          <span>New</span>
        </button>
      </header>

      <div className="bd-scroll min-h-0 flex-1 overflow-y-auto p-[12px_22px]">
        {loading && beads.length === 0 ? (
          <div className="text-[13px] text-[var(--text-3)]">Loading beads…</div>
        ) : rows.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-[13px] text-[var(--text-3)]">
            No beads match.
          </div>
        ) : (
          <div className="flex flex-col gap-[6px]">
            {rows.map((b) => (
              <Row key={b.id} bead={b} blocked={isBlocked(b, index)} onOpen={() => openDetail(b.id)} humanAllowlist={humanAllowlist} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  bead,
  blocked,
  onOpen,
  humanAllowlist,
}: {
  bead: Bead;
  blocked: boolean;
  onOpen: () => void;
  humanAllowlist: string[];
}) {
  const o = beadOrigin(bead, humanAllowlist);
  const labels = (bead.labels ?? []).filter((l) => l !== "archived").slice(0, 2);
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-[10px] border border-border bg-[var(--surface)] px-[13px] py-[9px] text-left transition-[border-color,box-shadow] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]"
    >
      <span
        className="h-[9px] w-[9px] flex-shrink-0 rounded-full"
        style={{ background: blocked ? "#ef4444" : catColor(bead.status) }}
        title={blocked ? "Blocked" : statusLabel(bead.status)}
      />
      <Icon
        name={typeIconName(bead.issue_type)}
        size={15}
        className="flex-shrink-0"
        style={{ color: typeColor(bead.issue_type) }}
      />
      <span className="w-[150px] flex-shrink-0 truncate font-mono text-[11.5px] text-[var(--text-3)]">
        {bead.id}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-[550] text-[var(--text)]">
        {bead.title}
      </span>
      {labels.map((l) => (
        <span
          key={l}
          className="hidden flex-shrink-0 rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px font-mono text-[10.5px] text-[var(--text-3)] lg:inline"
        >
          {l}
        </span>
      ))}
      <span className="flex-shrink-0">
        <PriorityChip p={bead.priority} />
      </span>
      <span className="hidden w-[26px] flex-shrink-0 justify-center sm:flex">
        <OriginBadge origin={o} title={originTitle(bead.created_by, o)} />
      </span>
      <span className="hidden min-w-0 max-w-[130px] flex-shrink-0 items-center gap-[6px] md:flex">
        <span
          className="flex h-[19px] w-[19px] flex-shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white"
          style={{ background: avatarColor(bead.assignee ?? "") }}
        >
          {initials(bead.assignee ?? "")}
        </span>
        <span className="truncate text-[11.5px] text-[var(--text-2)]">
          {bead.assignee || "Unassigned"}
        </span>
      </span>
      <span className="hidden w-[64px] flex-shrink-0 text-right font-mono text-[11px] text-[var(--text-3)] xl:inline">
        {relTime(bead.updated_at)}
      </span>
    </button>
  );
}
