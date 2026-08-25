"use client";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { MultiSelectFilter, type FilterOption } from "@/components/multi-select-filter";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { typeLabel, statusLabel, prioLabel } from "@/lib/beads-view";
import { BEAD_TYPES, BEAD_STATUSES } from "@/lib/schema";
import { type Filters, toggleStr, toggleNum } from "@/lib/filters";

function EpicFilter({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
      )
    : options;
  const active = selected.length > 0;

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setQuery(""); }}>
      <DropdownMenuTrigger
        className="flex h-9 items-center gap-[6px] rounded-[9px] border px-[11px] text-[12.5px] font-medium focus:outline-none"
        style={{
          borderColor: active ? "var(--brand)" : "var(--border)",
          background: active ? "var(--brand-weak)" : "var(--surface-2)",
          color: active ? "var(--brand)" : "var(--text-2)",
        }}
      >
        <span>Epic</span>
        {active && (
          <span className="rounded-full bg-[var(--brand)] px-[6px] text-[10.5px] font-semibold leading-[16px] text-white">
            {selected.length}
          </span>
        )}
        <Icon name="chevron" size={13} className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[240px]">
        <DropdownMenuLabel>Epic</DropdownMenuLabel>
        <div className="px-1.5 pb-1">
          <input
            data-epic-search
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Filter epics…"
            className="h-7 w-full rounded-[7px] border border-border bg-[var(--surface-2)] px-2 text-[12px] text-[var(--text)] outline-none"
          />
        </div>
        <DropdownMenuSeparator />
        {shown.length === 0 ? (
          <div className="px-1.5 py-2 text-[12px] text-[var(--text-3)]">No epics match</div>
        ) : (
          shown.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.value}
              checked={selected.includes(o.value)}
              onCheckedChange={() => onToggle(o.value)}
              closeOnClick={false}
            >
              {o.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear}>Clear epic</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Search + multi-select facet filters, shared by the Board and List views so
 * both expose the same controls (status, type, priority, labels, assignee,
 * epic, origin) + archived. Purely presentational: `labelOptions`,
 * `assigneeOptions`, and `epicOptions` are the data-derived facets (the rest
 * come from static enums) and are passed in rather than read from context here.
 */
export function FilterBar({
  filters,
  onChangeAction,
  labelOptions,
  assigneeOptions,
  epicOptions,
  showArchived,
  onShowArchivedAction,
  onClearAllAction,
}: {
  filters: Filters;
  onChangeAction: (f: Filters) => void;
  labelOptions: FilterOption[];
  assigneeOptions: FilterOption[];
  epicOptions: FilterOption[];
  showArchived: boolean;
  onShowArchivedAction: (v: boolean) => void;
  onClearAllAction: () => void;
}) {
  const set = (patch: Partial<Filters>) => onChangeAction({ ...filters, ...patch });

  // Count active filters (each non-empty facet + a non-empty search + archived)
  // so we can offer a one-click reset (bead 3it).
  const active =
    (filters.status.length ? 1 : 0) +
    (filters.type.length ? 1 : 0) +
    (filters.priority.length ? 1 : 0) +
    (filters.origin.length ? 1 : 0) +
    (filters.labels.length ? 1 : 0) +
    (filters.assignee.length ? 1 : 0) +
    (filters.epic.length ? 1 : 0) +
    (filters.search.trim() ? 1 : 0) +
    (showArchived ? 1 : 0);
  const clearAll = () => onClearAllAction();

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
        {epicOptions.length > 0 && (
          <EpicFilter
            options={epicOptions}
            selected={filters.epic}
            onToggle={(v) => set({ epic: toggleStr(filters.epic, v) })}
            onClear={() => set({ epic: [] })}
          />
        )}
        {labelOptions.length > 0 && (
          <MultiSelectFilter
            label="Labels"
            options={labelOptions}
            selected={filters.labels}
            onToggle={(v) => set({ labels: toggleStr(filters.labels, v) })}
            onClear={() => set({ labels: [] })}
          />
        )}
        {assigneeOptions.length > 0 && (
          <MultiSelectFilter
            label="Assignee"
            options={assigneeOptions}
            selected={filters.assignee}
            onToggle={(v) => set({ assignee: toggleStr(filters.assignee, v) })}
            onClear={() => set({ assignee: [] })}
          />
        )}
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
          onClick={() => onShowArchivedAction(!showArchived)}
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
