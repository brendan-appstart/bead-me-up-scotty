"use client";
import * as React from "react";
import { Icon } from "@/components/icons";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { typeLabel, statusLabel, prioLabel } from "@/lib/beads-view";
import { BEAD_TYPES, BEAD_STATUSES } from "@/lib/schema";
import { type Filters, emptyFilters, toggleStr, toggleNum } from "@/lib/filters";

/**
 * Search + multi-select facet filters, shared by the Board and List views so
 * both expose the same controls (status, type, priority, origin) + archived.
 */
export function FilterBar({
  filters,
  onChange,
  showArchived,
  onShowArchived,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  showArchived: boolean;
  onShowArchived: (v: boolean) => void;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  // Count active filters (each non-empty facet + a non-empty search + archived)
  // so we can offer a one-click reset (bead 3it).
  const active =
    (filters.status.length ? 1 : 0) +
    (filters.type.length ? 1 : 0) +
    (filters.priority.length ? 1 : 0) +
    (filters.origin.length ? 1 : 0) +
    (filters.search.trim() ? 1 : 0) +
    (showArchived ? 1 : 0);
  const clearAll = () => {
    onChange(emptyFilters);
    onShowArchived(false);
  };

  return (
    <>
      <div className="flex h-9 max-w-[280px] flex-1 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[11px]">
        <Icon name="search" size={15} className="flex-shrink-0 text-[var(--text-3)]" />
        <input
          data-search
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search beads…  (/)"
          className="w-full border-none bg-transparent text-[13px] text-[var(--text)] outline-none"
        />
      </div>

      <div className="flex items-center gap-[7px]">
        <MultiSelectFilter
          label="Status"
          options={BEAD_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
          selected={filters.status}
          onToggle={(v) => set({ status: toggleStr(filters.status, v) })}
          onClear={() => set({ status: [] })}
        />
        <MultiSelectFilter
          label="Type"
          options={BEAD_TYPES.filter((t) => t !== "epic").map((t) => ({ value: t, label: typeLabel(t) }))}
          selected={filters.type}
          onToggle={(v) => set({ type: toggleStr(filters.type, v) })}
          onClear={() => set({ type: [] })}
        />
        <MultiSelectFilter
          label="Priority"
          options={[0, 1, 2, 3, 4].map((p) => ({ value: String(p), label: prioLabel(p) }))}
          selected={filters.priority.map(String)}
          onToggle={(v) => set({ priority: toggleNum(filters.priority, Number(v)) })}
          onClear={() => set({ priority: [] })}
        />
        <MultiSelectFilter
          label="Origin"
          options={[
            { value: "human", label: "Human" },
            { value: "agent", label: "Agent" },
          ]}
          selected={filters.origin}
          onToggle={(v) => set({ origin: toggleStr(filters.origin, v) })}
          onClear={() => set({ origin: [] })}
        />
        <button
          onClick={() => onShowArchived(!showArchived)}
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
        {active > 0 && (
          <button
            onClick={clearAll}
            title="Clear all filters"
            className="flex h-9 items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[11px] text-[12.5px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)]"
          >
            <Icon name="x" size={14} />
            <span>Clear · {active}</span>
          </button>
        )}
      </div>
    </>
  );
}
