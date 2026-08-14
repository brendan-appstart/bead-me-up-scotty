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

type BeadNodeData = { bead: Bead; onOpen: (id: string) => void; horizontal?: boolean };

function BeadNode({ data }: NodeProps) {
  const { bead, onOpen, horizontal } = data as unknown as BeadNodeData;
  return (
    <div
      onClick={() => onOpen(bead.id)}
      className="w-[150px] cursor-pointer rounded-[11px] border border-border bg-[var(--surface)] p-[9px_11px] shadow-[var(--shadow)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)]"
    >
      <Handle
        type="target"
        position={horizontal ? Position.Left : Position.Top}
        style={{ background: "var(--text-3)" }}
      />
      <div className="mb-[5px] flex items-center gap-[6px]">
        <span className="h-2 w-2 rounded-full" style={{ background: catColor(bead.status) }} />
        <span className="font-mono text-[10.5px] text-[var(--text-3)]">{bead.id}</span>
        <span className="flex-1" />
        <Icon name={typeIconName(bead.issue_type)} size={12} style={{ color: typeColor(bead.issue_type) }} />
      </div>
      <div className="text-[12px] font-[550] leading-[1.3] text-[var(--text)] [text-wrap:pretty]">
        {bead.title.replace(/\s*\([^)]*\)\s*/, "")}
      </div>
      <Handle
        type="source"
        position={horizontal ? Position.Right : Position.Bottom}
        style={{ background: "var(--text-3)" }}
      />
    </div>
  );
}

const nodeTypes = { bead: BeadNode };

function layout(beads: Bead[], onOpen: (id: string) => void): { nodes: Node[]; edges: Edge[] } {
  const present = new Set(beads.map((b) => b.id));
  const epics = beads.filter((b) => b.issue_type === "epic");
  const loose = beads.filter(
    (b) => b.issue_type !== "epic" && !(b.dependencies ?? []).some((d) => d.type === "parent-child"),
  );

  const nodes: Node[] = [];
  const seen = new Set<string>();
  // An epic can be both a column head and another epic's child; React Flow
  // rejects duplicate node ids, so the first placement wins.
  const push = (n: Node) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    nodes.push(n);
  };
  const COL = 230;
  const ROW = 116;

  epics.forEach((e, ci) => {
    push({
      id: e.id,
      type: "bead",
      position: { x: ci * COL, y: 0 },
      data: { bead: e, onOpen },
    });
    childrenOf(e.id, beads).forEach((k, ri) => {
      push({
        id: k.id,
        type: "bead",
        position: { x: ci * COL, y: (ri + 1) * ROW },
        data: { bead: k, onOpen },
      });
    });
  });

  // Wrap the loose beads into a grid instead of one endless column, so the
  // fitted view stays near screen aspect ratio.
  const looseCol = epics.length;
  const WRAP = Math.max(6, Math.ceil(Math.sqrt(loose.length * 2)));
  loose.forEach((b, ri) => {
    push({
      id: b.id,
      type: "bead",
      position: { x: (looseCol + Math.floor(ri / WRAP)) * COL, y: (ri % WRAP) * ROW },
      data: { bead: b, onOpen },
    });
  });

  const placed = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = [];
  for (const b of beads) {
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

/** Every descendant of an epic, following parent-child edges through sub-epics. */
function epicSubtree(epicId: string, beads: Bead[]): Bead[] {
  const out: Bead[] = [];
  const seen = new Set([epicId]);
  const queue = [epicId];
  while (queue.length) {
    for (const k of childrenOf(queue.shift()!, beads)) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      out.push(k);
      queue.push(k.id);
    }
  }
  return out;
}

const BLOCKING = new Set(["blocks", "conditional-blocks", "waits-for"]);

/**
 * Left-to-right layered layout for one epic's subtree: a bead's column is its
 * longest blocking-dependency chain, so unblocked work sits on the left and
 * downstream work flows right. Edges are drawn upstream -> downstream to read
 * in the same direction; parent-child edges are omitted (the tree structure is
 * the selection, not the flow).
 */
function epicLayout(beads: Bead[], onOpen: (id: string) => void): { nodes: Node[]; edges: Edge[] } {
  const present = new Map(beads.map((b) => [b.id, b]));
  const depth = new Map<string, number>();
  const depthOf = (b: Bead, trail: Set<string>): number => {
    const known = depth.get(b.id);
    if (known !== undefined) return known;
    if (trail.has(b.id)) return 0;
    trail.add(b.id);
    const blockers = (b.dependencies ?? []).filter(
      (d) => BLOCKING.has(d.type) && present.has(d.depends_on_id),
    );
    const d = blockers.length
      ? 1 + Math.max(...blockers.map((x) => depthOf(present.get(x.depends_on_id)!, trail)))
      : 0;
    depth.set(b.id, d);
    return d;
  };
  for (const b of beads) depthOf(b, new Set());

  const layers = new Map<number, Bead[]>();
  for (const b of beads) {
    const d = depth.get(b.id) ?? 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(b);
  }

  const COL = 250;
  const ROW = 116;
  const nodes: Node[] = [];
  for (const d of [...layers.keys()].sort((a, b) => a - b)) {
    layers
      .get(d)!
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
      .forEach((b, ri) => {
        nodes.push({
          id: b.id,
          type: "bead",
          position: { x: d * COL, y: ri * ROW },
          data: { bead: b, onOpen, horizontal: true },
        });
      });
  }

  const edges: Edge[] = [];
  for (const b of beads) {
    for (const d of b.dependencies ?? []) {
      if (d.type === "parent-child" || !present.has(d.depends_on_id)) continue;
      const blocking = BLOCKING.has(d.type);
      const related = d.type === "related" || d.type === "relates-to";
      edges.push({
        id: `${d.depends_on_id}->${b.id}:${d.type}`,
        source: d.depends_on_id,
        target: b.id,
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
  const { beads, openDetail } = useApp();
  const addDep = useAddDep();
  // Recenter/fit the graph on the current nodes (bead mpe).
  const rf = React.useRef<ReactFlowInstance | null>(null);
  const center = React.useCallback(() => rf.current?.fitView({ padding: 0.2, duration: 400 }), []);

  // Closed beads dominate mature projects and zoom the fitted view out to
  // illegibility, so the graph maps live work by default with closed opt-in.
  const [showClosed, setShowClosed] = React.useState(false);

  // "" = the whole project (column-per-epic layout); an epic id switches to
  // that epic's subtree, layered left-to-right by dependency depth.
  const [epicId, setEpicId] = React.useState("");
  const epics = React.useMemo(
    () =>
      beads
        .filter((b) => b.issue_type === "epic" && b.status !== "closed")
        .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)),
    [beads],
  );

  const { nodes, edges } = React.useMemo(() => {
    const live = (b: Bead) =>
      (showClosed || b.status !== "closed") && !(b.labels ?? []).includes("archived");
    if (epicId) return epicLayout(epicSubtree(epicId, beads).filter(live), openDetail);
    return layout(beads.filter(live), openDetail);
  }, [beads, showClosed, epicId, openDetail]);

  // Toggling closed beads swaps most of the graph, so re-fit once the new
  // nodes have painted.
  React.useEffect(() => {
    const t = setTimeout(() => rf.current?.fitView({ padding: 0.2, duration: 300 }), 50);
    return () => clearTimeout(t);
  }, [showClosed, epicId]);

  // Clicking a node spotlights its dependency neighborhood: the transitive
  // upstream chain (what it waits on) and downstream chain (what waits on it).
  // Everything else dims. Clicking the pane clears it.
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const focus = React.useMemo(() => {
    if (!focusId) return null;
    // Edge orientation flips in epic mode (drawn upstream -> downstream there,
    // dependent -> dependency otherwise), so normalize before walking.
    const dependent = (e: Edge) => (epicId ? e.target : e.source);
    const dependency = (e: Edge) => (epicId ? e.source : e.target);
    const up = new Set([focusId]);
    const down = new Set([focusId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of edges) {
        if (up.has(dependent(e)) && !up.has(dependency(e))) {
          up.add(dependency(e));
          grew = true;
        }
        if (down.has(dependency(e)) && !down.has(dependent(e))) {
          down.add(dependent(e));
          grew = true;
        }
      }
    }
    return { all: new Set([...up, ...down]), up: up.size - 1, down: down.size - 1 };
  }, [focusId, edges, epicId]);

  const shownNodes = React.useMemo(() => {
    if (!focus) return nodes;
    return nodes.map((n) => ({
      ...n,
      style: {
        ...n.style,
        opacity: focus.all.has(n.id) ? 1 : 0.12,
        outline: n.id === focusId ? "2.5px solid var(--brand)" : undefined,
        outlineOffset: n.id === focusId ? 3 : undefined,
        borderRadius: 11,
      },
    }));
  }, [nodes, focus, focusId]);

  const shownEdges = React.useMemo(() => {
    if (!focus) return edges;
    return edges.map((e) => {
      const lit = focus.all.has(e.source) && focus.all.has(e.target);
      return { ...e, style: { ...e.style, opacity: lit ? 1 : 0.05 }, animated: lit && e.animated };
    });
  }, [edges, focus]);

  const onConnect = React.useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      // Epic mode draws upstream -> downstream, so the dragged edge's TARGET is
      // the bead that gains the dependency.
      const [id, dependsOnId] = epicId ? [c.target, c.source] : [c.source, c.target];
      addDep.mutate({ id, dependsOnId, type: "blocks" });
    },
    [addDep, epicId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="flex-1">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Dependency graph</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {epicId ? (
              <>left → right = dependency order · drag upstream onto downstream to link</>
            ) : (
              <>
                <span className="font-mono">bd dep tree</span> · drag a node handle onto another
                to link (cycle-checked by bd)
              </>
            )}
          </span>
        </div>
        <select
          value={epicId}
          onChange={(e) => {
            setEpicId(e.target.value);
            setFocusId(null);
          }}
          title="Scope the graph to one epic's subtree"
          className="h-9 max-w-[280px] flex-shrink-0 cursor-pointer rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-[12.5px] font-[550] text-[var(--text-2)] outline-none hover:bg-[var(--surface-3)]"
        >
          <option value="">All epics</option>
          {epics.map((e) => (
            <option key={e.id} value={e.id}>
              {e.id} · {e.title.slice(0, 40)}
            </option>
          ))}
        </select>
        {focus && focusId && (
          <button
            onClick={() => setFocusId(null)}
            title="Clear the neighborhood spotlight"
            className="flex h-9 flex-shrink-0 items-center gap-[7px] rounded-[9px] px-[12px] text-[12.5px] font-[550] text-[var(--brand)]"
            style={{ background: "var(--brand-weak)" }}
          >
            <span className="font-mono">{focusId}</span>
            <span className="text-[11.5px] opacity-80">
              ↑{focus.up} · ↓{focus.down}
            </span>
            <Icon name="x" size={13} />
          </button>
        )}
        <label className="flex h-9 flex-shrink-0 cursor-pointer items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[12px] text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)]">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="accent-[var(--brand)]"
          />
          <span>Show closed</span>
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
          nodes={shownNodes}
          edges={shownEdges}
          nodeTypes={nodeTypes}
          onConnect={onConnect}
          onNodeClick={(_, n) => setFocusId(n.id)}
          onPaneClick={() => setFocusId(null)}
          onInit={(inst) => {
            rf.current = inst;
          }}
          // Large graphs (hundreds of beads) need a much lower zoom floor than
          // React Flow's 0.5 default, or fitView can't pull the whole graph into frame.
          minZoom={0.02}
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
