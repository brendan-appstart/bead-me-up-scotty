"use client";
import * as React from "react";
import { Icon, typeIconName } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { PriorityChip, OriginBadge } from "@/components/board/bead-card";
import { beadOrigin, originTitle } from "@/lib/attribution";
import {
  catColor,
  statusLabel,
  typeColor,
  typeLabel,
  avatarColor,
  initials,
  isBlocked,
  relTime,
} from "@/lib/beads-view";
import { BEAD_TYPES, type Bead } from "@/lib/schema";

const selectClass =
  "h-9 cursor-pointer rounded-[9px] border border-border bg-[var(--surface-2)] px-2 text-[12.5px] text-[var(--text-2)] outline-none";

export function ListView() {
  const { beads, index, humanAllowlist, openDetail, openCreate, loading } = useApp();
  const [search, setSearch] = React.useState("");
  const [type, setType] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return beads
      .filter((b) => {
        if (b.issue_type === "epic") return false;
        if (!showArchived && (b.labels ?? []).includes("archived")) return false;
        if (type && b.issue_type !== type) return false;
        if (
          q &&
          !(
            b.title.toLowerCase().includes(q) ||
            b.id.toLowerCase().includes(q) ||
            (b.assignee ?? "").toLowerCase().includes(q)
          )
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      });
  }, [beads, search, type, showArchived]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="mr-1 flex flex-col gap-px">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">List</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {rows.length} beads · sorted by priority
          </span>
        </div>

        <div className="flex h-9 max-w-[300px] flex-1 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[11px]">
          <Icon name="search" size={15} className="flex-shrink-0 text-[var(--text-3)]" />
          <input
            data-search
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search beads…  (/)"
            className="w-full border-none bg-transparent text-[13px] text-[var(--text)] outline-none"
          />
        </div>

        <div className="flex items-center gap-[7px]">
          <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {BEAD_TYPES.filter((t) => t !== "epic").map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowArchived((v) => !v)}
            title="Toggle archived"
            className="flex h-9 items-center gap-[6px] rounded-[9px] px-[11px] text-[12.5px] font-medium"
            style={{
              border: `1px solid ${showArchived ? "var(--brand)" : "var(--border)"}`,
              background: showArchived ? "var(--brand-weak)" : "var(--surface-2)",
              color: showArchived ? "var(--brand)" : "var(--text-2)",
            }}
          >
            <Icon name="archive" size={14} />
            <span>Archived</span>
          </button>
          <button
            onClick={() => openCreate()}
            className="flex h-9 items-center gap-[6px] rounded-[9px] px-[14px] text-[13px] font-[550] text-white"
            style={{ background: "var(--brand)", boxShadow: "0 2px 8px -2px var(--brand)" }}
          >
            <Icon name="plus" size={15} />
            <span>New</span>
          </button>
        </div>
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
