"use client";
import * as React from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { useSetStatus } from "@/hooks/use-beads";
import { useOrder, useSetOrder } from "@/hooks/use-order";
import { isBlocked, prioLabel, typeLabel } from "@/lib/beads-view";
import { beadOrigin } from "@/lib/attribution";
import { BEAD_TYPES } from "@/lib/schema";
import { Column, type ColumnDef } from "./column";
import type { Bead } from "@/lib/schema";

const selectClass =
  "h-9 cursor-pointer rounded-[9px] border border-border bg-[var(--surface-2)] px-2 text-[12.5px] text-[var(--text-2)] outline-none";

const COLUMNS: (ColumnDef & { test: (b: Bead, blocked: boolean) => boolean; status?: string })[] = [
  { id: "backlog", name: "Backlog", color: "#64748b", cmd: "deferred", droppable: true, status: "deferred", test: (b) => b.status === "deferred" },
  { id: "ready", name: "Ready", color: "#3b82f6", cmd: "bd ready", droppable: true, status: "open", test: (b, blocked) => b.status === "open" && !blocked },
  { id: "in_progress", name: "In Progress", color: "#d97706", cmd: "in_progress", droppable: true, status: "in_progress", test: (b) => b.status === "in_progress" || b.status === "hooked" },
  { id: "blocked", name: "Blocked", color: "#ef4444", cmd: "bd blocked", droppable: false, test: (b, blocked) => blocked && b.status !== "deferred" && b.status !== "closed" },
  { id: "done", name: "Done", color: "#16a34a", cmd: "closed", droppable: true, status: "closed", test: (b) => b.status === "closed" },
];

/** Sort a column's cards by the saved manual order, falling back to priority. */
function sortCards(cards: Bead[], order?: string[]): Bead[] {
  const rank = new Map((order ?? []).map((id, i) => [id, i] as const));
  return [...cards].sort((a, b) => {
    const ra = rank.has(a.id) ? (rank.get(a.id) as number) : Number.POSITIVE_INFINITY;
    const rb = rank.has(b.id) ? (rank.get(b.id) as number) : Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return a.priority - b.priority;
  });
}

export function Board() {
  const { beads, index, humanAllowlist, openCreate, loading, projectId } = useApp();
  const setStatus = useSetStatus();
  const { data: orderData } = useOrder(projectId);
  const setOrder = useSetOrder(projectId);
  const orders = React.useMemo(() => orderData?.orders ?? {}, [orderData]);
  const [search, setSearch] = React.useState("");
  const [filters, setFilters] = React.useState({
    type: "",
    prio: "",
    origin: "",
    showArchived: false,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const matchFilters = React.useCallback(
    (b: Bead) => {
      if (b.issue_type === "epic") return false;
      if (!filters.showArchived && (b.labels ?? []).includes("archived")) return false;
      if (filters.type && b.issue_type !== filters.type) return false;
      if (filters.prio !== "" && String(b.priority) !== filters.prio) return false;
      if (filters.origin && beadOrigin(b, humanAllowlist) !== filters.origin) return false;
      const q = search.trim().toLowerCase();
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
    },
    [filters, humanAllowlist, search],
  );

  const visible = React.useMemo(() => beads.filter(matchFilters), [beads, matchFilters]);
  const columns = React.useMemo(
    () =>
      COLUMNS.map((c) => ({
        col: c,
        cards: sortCards(visible.filter((b) => c.test(b, isBlocked(b, index))), orders[c.id]),
      })),
    [visible, index, orders],
  );

  // Which column each visible bead currently sits in (drag targets resolve here).
  const colOfBead = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const { col, cards } of columns) for (const b of cards) m.set(b.id, col.id);
    return m;
  }, [columns]);

  const boardCount = beads.filter(
    (b) => b.issue_type !== "epic" && !((b.labels ?? []).includes("archived") && !filters.showArchived),
  ).length;

  function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overRaw = e.over?.id ? String(e.over.id) : null;
    if (!overRaw) return;

    const activeCol = colOfBead.get(activeId);
    if (!activeCol) return;

    // `over` is a column id (dropped on empty area) or a bead id (over a card).
    const overCol = COLUMNS.some((c) => c.id === overRaw) ? overRaw : colOfBead.get(overRaw);
    if (!overCol) return;

    if (overCol !== activeCol) {
      // Cross-column → status change (existing behavior).
      const target = COLUMNS.find((c) => c.id === overCol);
      if (!target || !target.droppable || !target.status) return;
      const bead = index.get(activeId);
      if (!bead || bead.status === target.status) return;
      setStatus.mutate({ id: activeId, status: target.status });
      return;
    }

    // Within-column → reorder + persist the manual order.
    const ids = (columns.find((c) => c.col.id === activeCol)?.cards ?? []).map((b) => b.id);
    const oldIndex = ids.indexOf(activeId);
    const newIndex = overRaw === activeCol ? ids.length - 1 : ids.indexOf(overRaw);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
    setOrder.mutate({ columnId: activeCol, ids: arrayMove(ids, oldIndex, newIndex) });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="mr-1 flex flex-col gap-px">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Board</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {boardCount} beads · live from <span className="font-mono">bd list</span>
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
          <select
            className={selectClass}
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
          >
            <option value="">All types</option>
            {BEAD_TYPES.filter((t) => t !== "epic").map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={filters.prio}
            onChange={(e) => setFilters((f) => ({ ...f, prio: e.target.value }))}
          >
            <option value="">All priorities</option>
            {[0, 1, 2, 3, 4].map((p) => (
              <option key={p} value={String(p)}>
                {prioLabel(p)}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={filters.origin}
            onChange={(e) => setFilters((f) => ({ ...f, origin: e.target.value }))}
          >
            <option value="">All origins</option>
            <option value="human">Human</option>
            <option value="agent">Agent</option>
          </select>
          <button
            onClick={() => setFilters((f) => ({ ...f, showArchived: !f.showArchived }))}
            title="Toggle archived"
            className="flex h-9 items-center gap-[6px] rounded-[9px] px-[11px] text-[12.5px] font-medium"
            style={{
              border: `1px solid ${filters.showArchived ? "var(--brand)" : "var(--border)"}`,
              background: filters.showArchived ? "var(--brand-weak)" : "var(--surface-2)",
              color: filters.showArchived ? "var(--brand)" : "var(--text-2)",
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

      <div className="bd-scroll min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-[18px_22px]">
        {loading && beads.length === 0 ? (
          <div className="text-[13px] text-[var(--text-3)]">Loading beads…</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
            <div className="flex h-full min-h-0 gap-4">
              {columns.map(({ col, cards }) => (
                <Column key={col.id} col={col} cards={cards} />
              ))}
            </div>
          </DndContext>
        )}
      </div>
    </div>
  );
}
