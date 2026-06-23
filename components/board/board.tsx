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
import { isBlocked } from "@/lib/beads-view";
import { FilterBar } from "@/components/filter-bar";
import { matchesFilters, emptyFilters, type Filters } from "@/lib/filters";
import { BOARD_COLUMNS as COLUMNS, sortByOrder as sortCards } from "@/lib/board-columns";
import { Column } from "./column";
import type { Bead } from "@/lib/schema";

export function Board() {
  const { beads, index, humanAllowlist, openCreate, loading, projectId } = useApp();
  const setStatus = useSetStatus();
  const { data: orderData } = useOrder(projectId);
  const setOrder = useSetOrder(projectId);
  const orders = React.useMemo(() => orderData?.orders ?? {}, [orderData]);
  const [filters, setFilters] = React.useState<Filters>(emptyFilters);
  const [showArchived, setShowArchived] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const matchFilters = React.useCallback(
    (b: Bead) => {
      if (b.issue_type === "epic") return false;
      if (!showArchived && (b.labels ?? []).includes("archived")) return false;
      return matchesFilters(b, filters, humanAllowlist);
    },
    [filters, showArchived, humanAllowlist],
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
            {visible.length} beads · live from <span className="font-mono">bd list</span>
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
