"use client";
import * as React from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon, typeIconName } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { PriorityChip, OriginBadge } from "@/components/board/bead-card";
import { FilterBar } from "@/components/filter-bar";
import { useOrder, useSetOrder } from "@/hooks/use-order";
import { useSetStatus } from "@/hooks/use-beads";
import { matchesFilters, emptyFilters, type Filters } from "@/lib/filters";
import { BOARD_COLUMNS, COLUMN_ORDER, colOf } from "@/lib/board-columns";
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

function rankOf(order: string[] | undefined, id: string): number {
  if (!order) return Number.POSITIVE_INFINITY;
  const i = order.indexOf(id);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

export function ListView() {
  const { beads, index, humanAllowlist, openDetail, openCreate, loading, projectId } = useApp();
  const setStatus = useSetStatus();
  const { data: orderData } = useOrder(projectId);
  const setOrder = useSetOrder(projectId);
  const orders = React.useMemo(() => orderData?.orders ?? {}, [orderData]);

  const [filters, setFilters] = React.useState<Filters>(emptyFilters);
  const [showArchived, setShowArchived] = React.useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Which board column each bead belongs to (shared with the Board view).
  const colById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const b of beads) {
      const c = colOf(b, index);
      if (c) m.set(b.id, c);
    }
    return m;
  }, [beads, index]);

  // Sort: by board column order, then the column's shared manual rank, then priority.
  const rows = React.useMemo(() => {
    return beads
      .filter((b) => {
        if (b.issue_type === "epic") return false;
        if (!showArchived && (b.labels ?? []).includes("archived")) return false;
        return matchesFilters(b, filters, humanAllowlist);
      })
      .sort((a, b) => {
        const ca = COLUMN_ORDER.indexOf(colById.get(a.id) ?? "");
        const cb = COLUMN_ORDER.indexOf(colById.get(b.id) ?? "");
        if (ca !== cb) return ca - cb;
        const col = colById.get(a.id);
        const order = col ? orders[col] : undefined;
        const ra = rankOf(order, a.id);
        const rb = rankOf(order, b.id);
        if (ra !== rb) return ra - rb;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      });
  }, [beads, filters, showArchived, humanAllowlist, colById, orders]);

  function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId || overId === activeId) return;
    const activeCol = colById.get(activeId);
    const overCol = colById.get(overId);
    if (!activeCol || !overCol) return;

    if (overCol === activeCol) {
      // Reorder within a column → write that column's shared order (Board sees it too).
      const ids = rows.filter((b) => colById.get(b.id) === activeCol).map((b) => b.id);
      const oldI = ids.indexOf(activeId);
      const newI = ids.indexOf(overId);
      if (oldI === -1 || newI === -1 || oldI === newI) return;
      setOrder.mutate({ columnId: activeCol, ids: arrayMove(ids, oldI, newI) });
    } else {
      // Across columns → status change (cross-column = status, like the Board).
      const target = BOARD_COLUMNS.find((c) => c.id === overCol);
      if (!target || !target.droppable || !target.status) return;
      const bead = index.get(activeId);
      if (!bead || bead.status === target.status) return;
      setStatus.mutate({ id: activeId, status: target.status });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="mr-1 flex flex-col gap-px">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">List</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {rows.length} beads · drag to set run-order
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-[6px]">
                {rows.map((b, i) => {
                  const col = colById.get(b.id);
                  const prevCol = i > 0 ? colById.get(rows[i - 1].id) : undefined;
                  const showGroup = col && col !== prevCol;
                  const meta = BOARD_COLUMNS.find((c) => c.id === col);
                  return (
                    <React.Fragment key={b.id}>
                      {showGroup && meta && (
                        <div className="flex items-center gap-2 px-1 pb-px pt-3 first:pt-0">
                          <span
                            className="h-[7px] w-[7px] rounded-[2px]"
                            style={{ background: meta.color }}
                          />
                          <span className="text-[11px] font-semibold uppercase tracking-[.04em] text-[var(--text-3)]">
                            {meta.name}
                          </span>
                        </div>
                      )}
                      <Row
                        bead={b}
                        blocked={isBlocked(b, index)}
                        onOpen={() => openDetail(b.id)}
                        humanAllowlist={humanAllowlist}
                      />
                    </React.Fragment>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bead.id,
  });
  const o = beadOrigin(bead, humanAllowlist);
  const labels = (bead.labels ?? []).filter((l) => l !== "archived").slice(0, 2);
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="flex w-full touch-none items-center gap-3 rounded-[10px] border border-border bg-[var(--surface)] px-[13px] py-[9px] text-left transition-[border-color,box-shadow] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]"
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
