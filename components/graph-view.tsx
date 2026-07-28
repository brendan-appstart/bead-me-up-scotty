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
  return (
    <div
      onClick={() => onOpen(bead.id)}
      className="w-[150px] cursor-pointer rounded-[11px] border border-border bg-[var(--surface)] p-[9px_11px] shadow-[var(--shadow)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)]"
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

function layout(beads: Bead[], onOpen: (id: string) => void): { nodes: Node[]; edges: Edge[] } {
  // On a real project the unpruned graph drowns itself: closed and link-less
  // beads stack into one column tens of thousands of px tall, and fitView
  // zooms the whole canvas to sub-pixel scale — it *looks* empty. Show only
  // the live dependency structure: open beads that are epics, epic children,
  // or participants in at least one link.
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
  const visible = active.filter(
    (b) =>
      b.issue_type === "epic" ||
      linked.has(b.id) ||
      (b.dependencies ?? []).some((d) => d.type === "parent-child" && activeIds.has(d.depends_on_id)),
  );
  const present = new Set(visible.map((b) => b.id));
  const epics = visible.filter((b) => b.issue_type === "epic");

  const nodes: Node[] = [];
  const COL = 230;
  const ROW = 116;

  epics.forEach((e, ci) => {
    nodes.push({
      id: e.id,
      type: "bead",
      position: { x: ci * COL, y: 0 },
      data: { bead: e, onOpen },
    });
    childrenOf(e.id, visible).forEach((k, ri) => {
      if (nodes.some((n) => n.id === k.id)) return;
      nodes.push({
        id: k.id,
        type: "bead",
        position: { x: ci * COL, y: (ri + 1) * ROW },
        data: { bead: k, onOpen },
      });
    });
  });

  // Whatever isn't under a visible epic wraps into a grid instead of one
  // endless column, so fitView keeps the nodes at a readable scale.
  const placedUnderEpics = new Set(nodes.map((n) => n.id));
  const loose = visible.filter((b) => b.issue_type !== "epic" && !placedUnderEpics.has(b.id));
  const looseCol = epics.length;
  const LOOSE_ROWS = 14;
  loose.forEach((b, i) => {
    nodes.push({
      id: b.id,
      type: "bead",
      position: {
        x: (looseCol + Math.floor(i / LOOSE_ROWS)) * COL,
        y: (i % LOOSE_ROWS) * ROW,
      },
      data: { bead: b, onOpen },
    });
  });

  const placed = new Set(nodes.map((n) => n.id));
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
  const addDep = useAddDep();
  // Recenter/fit the graph on the current nodes (bead mpe).
  const rf = React.useRef<ReactFlowInstance | null>(null);
  const center = React.useCallback(() => rf.current?.fitView({ padding: 0.2, duration: 400 }), []);

  const { nodes, edges } = React.useMemo(
    () => layout(beads.filter((b) => !(b.labels ?? []).includes("archived")), openDetail),
    [beads, openDetail],
  );

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
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="flex-1">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Dependency graph</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            <span className="font-mono">bd dep tree</span> · drag a node handle onto another to link
            (cycle-checked by bd)
          </span>
        </div>
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
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesConnectable={!readOnly}
          onConnect={onConnect}
          onInit={(inst) => {
            rf.current = inst;
          }}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} color="var(--border)" />
          <Controls />
        </ReactFlow>
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
