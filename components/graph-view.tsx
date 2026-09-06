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
import { buildEpicGraphScope, graphDependencyLayers } from "@/lib/graph-epic";
import { graphNeighborhood } from "@/lib/graph-neighborhood";
import type { Bead } from "@/lib/schema";

type BeadNodeData = {
  bead: Bead;
  onOpen: (id: string) => void;
  horizontal?: boolean;
  outsideEpic?: boolean;
};

const SpotlightContext = React.createContext<{ selected: string | null; active: Set<string> | null }>({ selected: null, active: null });

function BeadNode({ data }: NodeProps) {
  const { bead, onOpen, horizontal, outsideEpic } = data as unknown as BeadNodeData;
  const { selectedBeadId, selectBead } = useApp();
  const spotlight = React.useContext(SpotlightContext);
  return (
    <div
      style={{
        opacity: !spotlight.active || spotlight.active.has(bead.id) ? 1 : 0.2,
        outline: spotlight.active && spotlight.selected === bead.id ? "2.5px solid var(--brand)" : undefined,
        outlineOffset: 3,
      }}
      role="button"
      tabIndex={0}
      data-keyboard-bead-id={bead.id}
      data-epic-scope={outsideEpic ? "outside" : "inside"}
      aria-current={selectedBeadId === bead.id ? "true" : undefined}
      onFocus={() => selectBead(bead.id)}
      onClick={() => {
        selectBead(bead.id);
        onOpen(bead.id);
      }}
      className={`w-[170px] cursor-pointer rounded-[11px] border bg-[var(--surface)] p-[9px_11px] shadow-[var(--shadow)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)] focus-visible:outline-none ${
        selectedBeadId === bead.id
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
          : "border-border"
      }`}
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
      {outsideEpic && (
        <div className="mb-[5px] w-fit rounded-full bg-[var(--surface-3)] px-[6px] py-[2px] text-[9px] font-[650] uppercase tracking-[.04em] text-[var(--text-3)]">
          Outside epic
        </div>
      )}
      <div className="break-words text-[12px] font-[550] leading-[1.3] text-[var(--text)] [overflow-wrap:anywhere] [text-wrap:pretty]">
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

const FLOW_BLOCKING = new Set(["blocks", "conditional-blocks", "waits-for"]);

function nodeSpan(bead: Bead, outsideEpic = false): number {
  const title = bead.title.replace(/\s*\([^)]*\)\s*/, "");
  // At 170px wide, 16 characters per line is deliberately conservative. The
  // estimate is uncapped so unusually long titles still reserve enough room.
  const titleLines = Math.max(1, Math.ceil(title.length / 16));
  return 82 + titleLines * 18 + (outsideEpic ? 24 : 0);
}

function styledEdges(beads: Bead[], horizontal: boolean): Edge[] {
  const present = new Set(beads.map((bead) => bead.id));
  const edgeIds = new Set<string>();
  const edges: Edge[] = [];
  for (const bead of beads) {
    for (const dependency of bead.dependencies ?? []) {
      if (!present.has(dependency.depends_on_id)) continue;
      const id = `${bead.id}->${dependency.depends_on_id}:${dependency.type}`;
      if (edgeIds.has(id)) continue;
      edgeIds.add(id);
      // Parent-child affects scoped layering, but keeps the whole graph's
      // established neutral hierarchy styling rather than looking like a red
      // active blocker.
      const blocking = FLOW_BLOCKING.has(dependency.type);
      const related = dependency.type === "related" || dependency.type === "relates-to";
      edges.push({
        // IDs remain canonical dependent -> prerequisite in both modes so the
        // PR43 spotlight can compare them directly with graphNeighborhood.
        id,
        source: horizontal ? dependency.depends_on_id : bead.id,
        target: horizontal ? bead.id : dependency.depends_on_id,
        animated: blocking,
        style: {
          stroke: blocking ? "#ef4444" : related ? "var(--brand)" : "var(--text-3)",
          strokeWidth: blocking ? 2 : 1.6,
          strokeDasharray: related ? "5 4" : undefined,
        },
      });
    }
  }
  return edges;
}

function liveGraphBeads(beads: Bead[], alwaysVisible = new Set<string>()): Bead[] {
  const active = beads.filter((bead) => bead.status !== "closed" || alwaysVisible.has(bead.id));
  const activeIds = new Set(active.map((bead) => bead.id));
  const linked = new Set<string>();
  for (const bead of active) {
    for (const dependency of bead.dependencies ?? []) {
      if (dependency.type === "parent-child" || !activeIds.has(dependency.depends_on_id)) continue;
      linked.add(bead.id);
      linked.add(dependency.depends_on_id);
    }
  }
  return active.filter(
    (bead) =>
      alwaysVisible.has(bead.id) ||
      bead.issue_type === "epic" ||
      linked.has(bead.id) ||
      (bead.dependencies ?? []).some(
        (dependency) =>
          dependency.type === "parent-child" && activeIds.has(dependency.depends_on_id),
      ),
  );
}

function layout(beads: Bead[], onOpen: (id: string) => void): { nodes: Node[]; edges: Edge[] } {
  const epics = beads.filter((b) => b.issue_type === "epic");

  const nodes: Node[] = [];
  const COL = 250;

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
    let y = 0;
    place(e, ci * COL, y);
    y += nodeSpan(e);
    childrenOf(e.id, beads).forEach((child) => {
      place(child, ci * COL, y);
      y += nodeSpan(child);
    });
  });

  // Whatever isn't under a visible epic wraps into a grid instead of one
  // endless column, so fitView keeps the nodes at a readable scale.
  const loose = beads.filter((b) => b.issue_type !== "epic" && !placedIds.has(b.id));
  const looseCol = epics.length;
  const LOOSE_ROWS = Math.max(6, Math.ceil(Math.sqrt(loose.length * 2)));
  const looseY: number[] = [];
  loose.forEach((bead, index) => {
    const column = Math.floor(index / LOOSE_ROWS);
    place(bead, (looseCol + column) * COL, looseY[column] ?? 0);
    looseY[column] = (looseY[column] ?? 0) + nodeSpan(bead);
  });

  return { nodes, edges: styledEdges(beads, false) };
}

function epicLayout(
  beads: Bead[],
  onOpen: (id: string) => void,
  outsideIds: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const layers = graphDependencyLayers(beads);
  const byLayer = new Map<number, Bead[]>();
  for (const bead of beads) {
    const layer = layers.get(bead.id) ?? 0;
    const current = byLayer.get(layer);
    if (current) current.push(bead);
    else byLayer.set(layer, [bead]);
  }

  const nodes: Node[] = [];
  const COL = 270;
  for (const layer of [...byLayer.keys()].sort((a, b) => a - b)) {
    let y = 0;
    const layerBeads = byLayer.get(layer)!;
    layerBeads.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    for (const bead of layerBeads) {
      const outsideEpic = outsideIds.has(bead.id);
      nodes.push({
        id: bead.id,
        type: "bead",
        position: { x: layer * COL, y },
        data: { bead, onOpen, horizontal: true, outsideEpic },
      });
      y += nodeSpan(bead, outsideEpic);
    }
  }
  return { nodes, edges: styledEdges(beads, true) };
}

export function GraphView() {
  const { beads, openDetail, readOnly } = useApp();
  const [epicId, setEpicId] = React.useState("");
  const [liveOnly, setLiveOnly] = React.useState(false);
  const [spotlight, setSpotlight] = React.useState(false);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const activateNode = React.useCallback((id: string) => {
    if (spotlight) setFocusId(id);
    else openDetail(id);
  }, [spotlight, openDetail]);
  const addDep = useAddDep();
  // Recenter/fit the graph on the current nodes (bead mpe).
  const rf = React.useRef<ReactFlowInstance | null>(null);
  const center = React.useCallback(() => rf.current?.fitView({ padding: 0.2, minZoom: 0.02, duration: 400 }), []);

  const epics = React.useMemo(
    () =>
      beads
        .filter(
          (bead) =>
            bead.issue_type === "epic" && !(bead.labels ?? []).includes("archived"),
        )
        .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)),
    [beads],
  );
  const effectiveEpicId = epics.some((epic) => epic.id === epicId) ? epicId : "";

  // Preserve the original archive exclusion; closed and unlinked work remains
  // visible by default. Epic scope adds only direct outside neighbors.
  const { nodes, edges, considered } = React.useMemo(() => {
    const nonArchived = beads.filter((bead) => !(bead.labels ?? []).includes("archived"));
    if (effectiveEpicId) {
      const scope = buildEpicGraphScope(nonArchived, effectiveEpicId);
      const visible = liveOnly
        ? liveGraphBeads(scope.beads, new Set([effectiveEpicId]))
        : scope.beads;
      return {
        ...epicLayout(visible, activateNode, scope.outsideIds),
        considered: scope.beads.length,
      };
    }
    const visible = liveOnly ? liveGraphBeads(nonArchived) : nonArchived;
    return { ...layout(visible, activateNode), considered: nonArchived.length };
  }, [beads, activateNode, effectiveEpicId, liveOnly]);
  const hidden = Math.max(0, considered - nodes.length);
  const focus = React.useMemo(() => {
    if (!spotlight || !focusId || !nodes.some(n => n.id === focusId)) return null;
    return graphNeighborhood(beads, new Set(nodes.map(n => n.id)), focusId);
  }, [beads, nodes, spotlight, focusId]);
  // Keep React Flow node objects stable while highlighting. Replacing raw
  // nodes discards their measured dimensions and briefly hides click targets.
  const spotlightContext = React.useMemo(() => ({ selected: focusId, active: focus?.all ?? null }), [focusId, focus]);
  const shownEdges = React.useMemo(() => focus ? edges.map(e => {
    const lit = focus.edgeIds.has(e.id) && focus.all.has(e.source) && focus.all.has(e.target);
    return { ...e, style: { ...e.style, opacity: lit ? 1 : 0.12 }, animated: lit && e.animated };
  }) : edges, [edges, focus]);


  const onConnect = React.useCallback(
    (c: Connection) => {
      if (readOnly) return;
      if (c.source && c.target && c.source !== c.target) {
        // Scoped edges read prerequisite -> dependent, so the target receives
        // a dependency on the source. Whole-graph semantics stay unchanged.
        const [id, dependsOnId] = effectiveEpicId
          ? [c.target, c.source]
          : [c.source, c.target];
        addDep.mutate({ id, dependsOnId, type: "blocks" });
      }
    },
    [addDep, effectiveEpicId, readOnly],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="flex-1">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Dependency graph</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {effectiveEpicId
              ? spotlight
                ? "Left → right: prerequisite → dependent · select to spotlight active blocking chains; double-click for details"
                : readOnly
                  ? "Left → right: prerequisite → dependent · select a bead to view its details"
                  : "Left → right: prerequisite → dependent · drag a prerequisite onto its dependent"
              : spotlight
                ? "Select a bead to highlight active blocking chains; double-click for details"
                : readOnly
                  ? "Select a bead to view its details"
                  : "Drag from a dependent to its prerequisite to add a dependency"}
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
        <select
          aria-label="Graph scope"
          value={effectiveEpicId}
          onChange={(event) => {
            setEpicId(event.target.value);
            setFocusId(null);
          }}
          title="Scope the graph to an epic and its descendants"
          className="h-9 max-w-[280px] flex-shrink-0 cursor-pointer rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-[12.5px] font-[550] text-[var(--text-2)] outline-none hover:bg-[var(--surface-3)]"
        >
          <option value="">All beads</option>
          {epics.map((epic) => (
            <option key={epic.id} value={epic.id}>
              {epic.id} · {epic.title}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--text-2)]">
          <input type="checkbox" checked={spotlight} className="accent-[var(--brand)]"
            onChange={e => { setSpotlight(e.target.checked); setFocusId(null); }} />
          Spotlight dependencies
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--text-2)]">
          <input
            type="checkbox"
            checked={liveOnly}
            onChange={(e) => { setLiveOnly(e.target.checked); setFocusId(null); }}
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
        {spotlight && (
          <div className="flex h-9 basis-full items-center">
            {focus && focusId ? (
              <button onClick={() => setFocusId(null)} title="Clear the dependency spotlight"
                className="flex h-9 items-center gap-2 rounded-[9px] bg-[var(--brand-weak)] px-3 text-[12px] text-[var(--brand)]">
                <span className="font-mono">{focusId}</span>
                <span>{focus.up} upstream · {focus.down} downstream</span>
                <Icon name="x" size={13} />
              </button>
            ) : <span className="text-[12px] text-[var(--text-3)]">Choose a bead to highlight its blocking chains.</span>}
          </div>
        )}
      </header>
      <div className="relative min-h-0 flex-1">
        <SpotlightContext.Provider value={spotlightContext}>
        <ReactFlow
          key={`${effectiveEpicId || "all"}:${liveOnly ? "live" : "complete"}`}
          nodes={nodes}
          edges={shownEdges}
          zoomOnDoubleClick={!spotlight}
          onPaneClick={() => setFocusId(null)}
          onNodeDoubleClick={(_, node) => { if (spotlight) openDetail(node.id); }}
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
        </SpotlightContext.Provider>
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
