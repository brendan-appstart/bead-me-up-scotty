"use client";
import * as React from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Icon, typeIconName } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { useAddDep } from "@/hooks/use-beads";
import { catColor, typeColor, childrenOf } from "@/lib/beads-view";
import type { Bead } from "@/lib/schema";

type BeadNodeData = { bead: Bead; onOpen: (id: string) => void };

function BeadNode({ data }: NodeProps) {
  const { bead, onOpen } = data as unknown as BeadNodeData;
  const { selectedBeadId, selectBead } = useApp();
  return (
    <div
      role="button"
      tabIndex={0}
      data-keyboard-bead-id={bead.id}
      aria-current={selectedBeadId === bead.id ? "true" : undefined}
      onFocus={() => selectBead(bead.id)}
      onClick={() => {
        selectBead(bead.id);
        onOpen(bead.id);
      }}
      className={`w-[150px] cursor-pointer rounded-[11px] border bg-[var(--surface)] p-[9px_11px] shadow-[var(--shadow)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)] focus-visible:outline-none ${
        selectedBeadId === bead.id
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
          : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} style={{ background: "var(--text-3)" }} />
      <div className="mb-[5px] flex items-center gap-[6px]">
        <span className="h-2 w-2 rounded-full" style={{ background: catColor(bead.status) }} />
        <span className="font-mono text-[10.5px] text-[var(--text-3)]">{bead.id}</span>
        <span className="flex-1" />
        <Icon name={typeIconName(bead.issue_type)} size={12} style={{ color: typeColor(bead.issue_type) }} />
      </div>
      <div className="text-[12px] font-[550] leading-[1.3] text-[var(--text)] [text-wrap:pretty]">
        {bead.title.replace(/\s*\([^)]*\)\s*/, "")}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: "var(--text-3)" }} />
    </div>
  );
}

const nodeTypes = { bead: BeadNode };

function layout(beads: Bead[], onOpen: (id: string) => void, liveOnly: boolean): { nodes: Node[]; edges: Edge[] } {
  // Live structure is an optional view, never the only way to access the graph:
  // unlinked beads must remain available for creating their first dependency.
  const active = beads.filter((b) => b.status !== "closed");
  const activeIds = new Set(active.map((b) => b.id));
  const linked = new Set<string>();
  for (const b of active) {
    for (const d of b.dependencies ?? []) {
      if (d.type === "parent-child") continue;
      if (activeIds.has(d.depends_on_id)) {
        linked.add(b.id);
        linked.add(d.depends_on_id);
      }
    }
  }
  const visible = liveOnly ? active.filter(
    (b) =>
      b.issue_type === "epic" ||
      linked.has(b.id) ||
      (b.dependencies ?? []).some((d) => d.type === "parent-child" && activeIds.has(d.depends_on_id)),
  ) : beads;
  const present = new Set(visible.map((b) => b.id));
  const epics = visible.filter((b) => b.issue_type === "epic");

  const nodes: Node[] = [];
  const COL = 230;
  const ROW = 116;

  // React Flow keys by node id, so a bead placed twice corrupts the canvas. A
  // bead can reach this loop twice two ways: as a child of two epics, and — the
  // one that's easy to miss — as an epic that is itself another epic's child,
  // which gets pushed once by its parent's iteration and again as its own
  // column. One id set covers both.
  const placedIds = new Set<string>();
  const place = (b: Bead, x: number, y: number) => {
    if (placedIds.has(b.id)) return;
    placedIds.add(b.id);
    nodes.push({ id: b.id, type: "bead", position: { x, y }, data: { bead: b, onOpen } });
  };

  epics.forEach((e, ci) => {
    place(e, ci * COL, 0);
    childrenOf(e.id, visible).forEach((k, ri) => place(k, ci * COL, (ri + 1) * ROW));
  });

  // Whatever isn't under a visible epic wraps into a grid instead of one
  // endless column, so fitView keeps the nodes at a readable scale.
  const loose = visible.filter((b) => b.issue_type !== "epic" && !placedIds.has(b.id));
  const looseCol = epics.length;
  const LOOSE_ROWS = Math.max(6, Math.ceil(Math.sqrt(loose.length * 2)));
  loose.forEach((b, i) =>
    place(b, (looseCol + Math.floor(i / LOOSE_ROWS)) * COL, (i % LOOSE_ROWS) * ROW),
  );

  const placed = placedIds;
  const edges: Edge[] = [];
  for (const b of visible) {
    if (!placed.has(b.id)) continue;
    for (const d of b.dependencies ?? []) {
      if (!present.has(d.depends_on_id) || !placed.has(d.depends_on_id)) continue;
      const blocking = d.type === "blocks" || d.type === "conditional-blocks" || d.type === "waits-for";
      const related = d.type === "related" || d.type === "relates-to";
      edges.push({
        id: `${b.id}->${d.depends_on_id}:${d.type}`,
        source: b.id,
        target: d.depends_on_id,
        animated: blocking,
        style: {
          stroke: blocking ? "#ef4444" : related ? "var(--brand)" : "var(--text-3)",
          strokeWidth: blocking ? 2 : 1.6,
          strokeDasharray: related ? "5 4" : undefined,
        },
      });
    }
  }
  return { nodes, edges };
}

export function GraphView() {
  const { beads, openDetail, readOnly } = useApp();
  const [liveOnly, setLiveOnly] = React.useState(false);
  const addDep = useAddDep();
  // Recenter/fit the graph on the current nodes (bead mpe).
  const rf = React.useRef<ReactFlowInstance | null>(null);
  const center = React.useCallback(() => rf.current?.fitView({ padding: 0.2, minZoom: 0.02, duration: 400 }), []);

  // Preserve the original archive exclusion; all other pruning is opt-in.
  const { nodes, edges, considered } = React.useMemo(() => {
    const shown = beads.filter((b) => !(b.labels ?? []).includes("archived"));
    return { ...layout(shown, openDetail, liveOnly), considered: shown.length };
  }, [beads, openDetail, liveOnly]);
  const hidden = considered - nodes.length;

  const onConnect = React.useCallback(
    (c: Connection) => {
      if (readOnly) return;
      if (c.source && c.target && c.source !== c.target) {
        addDep.mutate({ id: c.source, dependsOnId: c.target, type: "blocks" });
      }
    },
    [addDep, readOnly],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="flex-1">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Dependency graph</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {readOnly ? "Select a bead to view its details" : "Drag between node handles to add a dependency"}
            {" · "}{nodes.length} beads shown
            {hidden > 0 && (
              <>
                {" · "}
                <span title="Turn off Live dependencies only to include closed and unlinked beads.">
                  {hidden} hidden by filter
                </span>
              </>
            )}
          </span>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--text-2)]">
          <input
            type="checkbox"
            checked={liveOnly}
            onChange={(e) => setLiveOnly(e.target.checked)}
            className="accent-[var(--brand)]"
          />
          Live dependencies only
        </label>
        <button
          onClick={center}
          title="Center the graph on all issues"
          className="flex h-9 flex-shrink-0 items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[12px] text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)]"
        >
          <Icon name="target" size={15} />
          <span>Center</span>
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          key={liveOnly ? "live" : "all"}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesConnectable={!readOnly}
          onConnect={onConnect}
          onInit={(inst) => {
            rf.current = inst;
          }}
          minZoom={0.02}
          fitView
          fitViewOptions={{ padding: 0.2, minZoom: 0.02 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} color="var(--border)" />
          <Controls fitViewOptions={{ padding: 0.2, minZoom: 0.02 }} />
        </ReactFlow>
        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="pointer-events-auto max-w-[360px] rounded-[12px] border border-border bg-[var(--surface)] p-[16px_18px] text-center shadow-[var(--shadow)]">
              <div className="text-[13px] font-[650] text-[var(--text)]">
                {liveOnly && considered > 0 ? "No live dependencies" : "No beads to show"}
              </div>
              <p className="m-0 mt-[6px] text-[12px] leading-[1.5] text-[var(--text-2)]">
                {considered === 0
                  ? "There are no non-archived beads in this project."
                  : "The current filter hides all beads. Show all beads to inspect completed work or create new dependencies."}
              </p>
              {liveOnly && considered > 0 && (
                <button
                  onClick={() => setLiveOnly(false)}
                  className="mt-3 rounded-lg border border-border px-3 py-1.5 text-[12px] hover:bg-[var(--surface-2)]"
                >
                  Show all beads
                </button>
              )}
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-[18px] left-1/2 flex -translate-x-1/2 gap-[18px] rounded-[11px] border border-border bg-[var(--surface)] p-[9px_16px] text-[11.5px] text-[var(--text-2)] shadow-[var(--shadow)]">
          <span className="flex items-center gap-[6px]">
            <span className="h-[2px] w-[18px] bg-[#ef4444]" />
            blocks
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="h-[2px] w-[18px] bg-[var(--text-3)]" />
            parent-child
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="h-0 w-[18px] border-t-2 border-dashed border-[var(--brand)]" />
            related
          </span>
        </div>
      </div>
    </div>
  );
}
