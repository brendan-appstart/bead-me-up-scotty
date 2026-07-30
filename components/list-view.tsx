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
import { CopyableId } from "@/components/copyable-id";
import { FilterBar } from "@/components/filter-bar";
import { useOrder, useSetOrder } from "@/hooks/use-order";
import { useSetStatus } from "@/hooks/use-beads";
import { matchesFilters, emptyFilters, labelOptionsFrom, assigneeOptionsFrom, type Filters } from "@/lib/filters";
import { BOARD_COLUMNS, COLUMN_ORDER, colOf } from "@/lib/board-columns";
import { beadOrigin, originTitle } from "@/lib/attribution";
import {
  catColor,
  statusLabel,
  typeColor,
  avatarColor,
  initials,
  isBlocked,
  parentOf,
  childrenCountMap,
  relTime,
  fmtDateTime,
} from "@/lib/beads-view";
import { type Bead } from "@/lib/schema";

/**
 * Priority assumed for a bead with no parent epic when breaking ties. Medium, so
 * an orphan sorts among the children of medium epics rather than being shoved to
 * either extreme — a judgement call, hence a named constant.
 */
const DEFAULT_EPIC_PRIORITY = 2;

function rankOf(order: string[] | undefined, id: string): number {
  if (!order) return Number.POSITIVE_INFINITY;
  const i = order.indexOf(id);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

export function ListView() {
  const { beads, index, humanAllowlist, openDetail, openCreate, openEpic, loading, projectId, readOnly } =
    useApp();
  const setStatus = useSetStatus();
  const { data: orderData } = useOrder(projectId);
  const setOrder = useSetOrder(projectId);
  const orders = React.useMemo(() => orderData?.orders ?? {}, [orderData]);

  const [filters, setFilters] = React.useState<Filters>(emptyFilters);
  const [showArchived, setShowArchived] = React.useState(false);
  // Derived from ALL beads (not the filtered set) so selecting one label
  // doesn't make the remaining options vanish from the dropdown.
  const labelOptions = React.useMemo(() => labelOptionsFrom(beads), [beads]);
  const assigneeOptions = React.useMemo(() => assigneeOptionsFrom(beads), [beads]);
  // One pass, not childrenOf() per row (that would be O(n^2)).
  const childCounts = React.useMemo(() => childrenCountMap(beads), [beads]);

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
        // Tie-break on the parent epic's priority (gh-18): a medium task under a
        // high epic outranks a medium task under a low one. Own priority always
        // wins first, and manual drag rank above still wins over both.
        const ea = parentOf(a, index)?.priority ?? DEFAULT_EPIC_PRIORITY;
        const eb = parentOf(b, index)?.priority ?? DEFAULT_EPIC_PRIORITY;
        if (ea !== eb) return ea - eb;
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      });
  }, [beads, filters, showArchived, humanAllowlist, colById, orders, index]);

  // Per-column counts for the group headers. Derived from `rows` (not `beads`)
  // so the count always matches what is rendered beneath the header once the
  // filters and the archived toggle have been applied.
  const countByCol = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const b of rows) {
      const c = colById.get(b.id);
      if (c) m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [rows, colById]);

  function onDragEnd(e: DragEndEvent) {
    if (readOnly) return;
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
          labelOptions={labelOptions}
          assigneeOptions={assigneeOptions}
          showArchived={showArchived}
          onShowArchived={setShowArchived}
        />

        {!readOnly && (
          <button
            onClick={() => openCreate()}
            className="flex h-9 flex-shrink-0 items-center gap-[6px] rounded-[9px] px-[14px] text-[13px] font-[550] text-white"
            style={{ background: "var(--brand)", boxShadow: "0 2px 8px -2px var(--brand)" }}
          >
            <Icon name="plus" size={15} />
            <span>New</span>
          </button>
        )}
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
                          <span className="rounded-full border border-border bg-[var(--surface-2)] px-2 py-px font-mono text-[10.5px] text-[var(--text-3)]">
                            {countByCol.get(col) ?? 0}
                          </span>
                        </div>
                      )}
                      <Row
                        bead={b}
                        blocked={isBlocked(b, index)}
                        onOpen={() => openDetail(b.id)}
                        parent={parentOf(b, index)}
                        onOpenParent={openEpic}
                        onOpenDetail={openDetail}
                        childCount={childCounts.get(b.id) ?? 0}
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
  parent,
  onOpenParent,
  onOpenDetail,
  childCount,
  humanAllowlist,
}: {
  bead: Bead;
  blocked: boolean;
  onOpen: () => void;
  parent: Bead | null;
  onOpenParent: (id: string) => void;
  onOpenDetail: (id: string) => void;
  childCount: number;
  humanAllowlist: string[];
}) {
  const { readOnly, selectedBeadId, selectBead } = useApp();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bead.id,
    disabled: readOnly,
  });
  const o = beadOrigin(bead, humanAllowlist);
  const labels = (bead.labels ?? []).filter((l) => l !== "archived").slice(0, 2);
  const openFromKeyboard = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...(readOnly ? {} : attributes)}
      role="button"
      tabIndex={0}
      data-keyboard-bead-id={bead.id}
      aria-current={selectedBeadId === bead.id ? "true" : undefined}
      onFocus={() => selectBead(bead.id)}
      onClick={() => {
        selectBead(bead.id);
        onOpen();
      }}
      onKeyDown={openFromKeyboard}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`flex w-full cursor-pointer touch-none items-center gap-3 rounded-[10px] border bg-[var(--surface)] px-[13px] py-[9px] text-left transition-[border-color,box-shadow] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)] focus-visible:outline-none ${
        selectedBeadId === bead.id
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
          : "border-border"
      }`}
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
      <CopyableId
        id={bead.id}
        className="w-[150px] flex-shrink-0 truncate font-mono text-[11.5px] text-[var(--text-3)]"
      />
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
      {/* The epic is shown because it now INFLUENCES the sort order (gh-18):
          a ranking whose reason isn't on screen reads as a bug. */}
      {childCount > 0 && (
        <span
          title={`${childCount} subtask${childCount === 1 ? "" : "s"}`}
          className="hidden flex-shrink-0 items-center gap-[4px] rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px text-[10.5px] text-[var(--text-3)] lg:flex"
        >
          <Icon name="list" size={10} className="flex-shrink-0" />
          {childCount}
        </span>
      )}
      {/* Shown because the parent now INFLUENCES the sort order (gh-18): a
          ranking whose reason isn't on screen reads as a bug. Epics route to
          the Epics screen; any other parent opens its drawer, since the Epics
          screen renders epics only. */}
      {parent && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (parent.issue_type === "epic") onOpenParent(parent.id);
            else onOpenDetail(parent.id);
          }}
          title={`${parent.id} · ${parent.title} · P${parent.priority}`}
          className="hidden max-w-[150px] flex-shrink-0 items-center gap-[4px] rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px text-[10.5px] text-[var(--text-3)] hover:border-[var(--brand)] hover:text-[var(--brand)] lg:flex"
        >
          <Icon
            name={parent.issue_type === "epic" ? "target" : typeIconName(parent.issue_type)}
            size={10}
            className="flex-shrink-0"
          />
          <span className="truncate">{parent.title}</span>
        </button>
      )}
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
      <span
        title={fmtDateTime(bead.updated_at)}
        className="hidden w-[64px] flex-shrink-0 text-right font-mono text-[11px] text-[var(--text-3)] xl:inline"
      >
        {relTime(bead.updated_at)}
      </span>
    </div>
  );
}
