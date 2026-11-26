"use client";
import * as React from "react";
import {
  ReactFlow,
  Background,
  BaseEdge,
  Controls,
  getBezierPath,
  Handle,
  Position,
  type Node,
  type Edge,
  type EdgeProps,
  type Connection,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Icon, typeIconName } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAddDep } from "@/hooks/use-beads";
import { catColor, typeColor, childrenOf } from "@/lib/beads-view";
import { buildEpicGraphScope, graphDependencyLayers } from "@/lib/graph-epic";
import { projectGraph, type GraphLink } from "@/lib/graph-collapse";
import { ACTIVE_BLOCKING_LINK_TYPES, graphNeighborhood } from "@/lib/graph-neighborhood";
import type { Bead } from "@/lib/schema";

type BeadNodeData = {
  bead: Bead;
  horizontal?: boolean;
  outsideEpic?: boolean;
  expandable?: boolean;
  hiddenCount?: number;
};

type GraphBeadNode = Node<BeadNodeData, "bead">;

const GraphNodeContext = React.createContext<{
  selected: string | null;
  active: Set<string> | null;
  setFocusId: (id: string | null) => void;
  activateNode: (id: string) => void;
  toggleFold: (id: string) => void;
} | null>(null);

function BeadNode({ data }: NodeProps<GraphBeadNode>) {
  const { bead, horizontal, outsideEpic, expandable, hiddenCount = 0 } = data;
  const { selectedBeadId, selectBead } = useApp();
  const { selected, active, setFocusId, activateNode, toggleFold } = React.useContext(GraphNodeContext)!;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const triggerId = React.useId();
  const trigger = React.useRef<HTMLButtonElement>(null);
  const focused = selected === bead.id;
  const opacity = !active || active.has(bead.id) ? 1 : 0.2;
  return (
    <div
      className="relative"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(true);
      }}
    >
      <div
        style={{ opacity, outline: focused ? "2.5px solid var(--brand)" : undefined, outlineOffset: 3 }}
        role="button"
        tabIndex={0}
        data-keyboard-bead-id={bead.id}
        data-epic-scope={outsideEpic ? "outside" : "inside"}
        aria-current={selectedBeadId === bead.id ? "true" : undefined}
        onFocus={() => selectBead(bead.id)}
        onClick={() => {
          selectBead(bead.id);
          activateNode(bead.id);
        }}
        className={`w-[170px] cursor-pointer rounded-[11px] border bg-[var(--surface)] p-[9px_11px] shadow-[var(--shadow)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)] focus-visible:outline-none ${
          selectedBeadId === bead.id ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30" : "border-border"
        } ${hiddenCount ? "pb-[32px]" : ""}`}
      >
        <Handle
          type="target"
          position={horizontal ? Position.Left : Position.Top}
          style={{ background: "var(--text-3)" }}
        />
        <div className="mb-[5px] flex items-center gap-[6px] pr-6">
          <span className="size-2 shrink-0 rounded-full" style={{ background: catColor(bead.status) }} />
          <span className="flex-1 truncate font-mono text-[10.5px] text-[var(--text-3)]" title={bead.id}>{bead.id}</span>
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
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} triggerId={triggerId}>
        <DropdownMenuTrigger
          id={triggerId}
          ref={trigger}
          aria-label={`Graph actions for ${bead.id}`}
          style={{ opacity }}
          className="nodrag nopan absolute top-[3px] right-[5px] grid size-7 cursor-pointer place-items-center rounded-md text-[var(--text-2)] hover:bg-[var(--surface-3)] focus-visible:bg-[var(--surface-3)]"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <span aria-hidden="true">⋯</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-max animate-none!"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
          {expandable && (
            <DropdownMenuItem onClick={() => toggleFold(bead.id)}>
              {hiddenCount ? "Expand subtasks" : "Collapse subtasks"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setFocusId(focused ? null : bead.id)}>
            {focused ? "Clear spotlight" : "Spotlight dependencies"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {hiddenCount > 0 && (
        <button
          type="button"
          className="nodrag nopan absolute bottom-[7px] left-[11px] h-5 cursor-pointer rounded-full bg-[var(--brand-weak)] px-[6px] text-[10px] font-semibold text-[var(--brand)] hover:underline"
          aria-label={`Expand ${hiddenCount} hidden ${hiddenCount === 1 ? "subtask" : "subtasks"} of ${bead.id}`}
          style={{ opacity }}
          onClick={(event) => {
            event.stopPropagation();
            trigger.current?.focus({ preventScroll: true });
            toggleFold(bead.id);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          +{hiddenCount} hidden
        </button>
      )}
    </div>
  );
}

const nodeTypes = { bead: BeadNode };

type Projection = ReturnType<typeof projectGraph>;
type GraphEdge = Edge<{ originalIds: string[]; lane: number }>;

function SummaryEdge(props: EdgeProps<GraphEdge>) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, data, style, label, labelStyle, labelBgStyle } = props;
  let [path, labelX, labelY] = getBezierPath(props);
  if (data?.lane) {
    // Separate parallel summaries from each other and from the original link.
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const offset = 28 * data.lane * (source < target ? 1 : -1) / (Math.hypot(dx, dy) || 1);
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    labelX = midX - dy * offset;
    labelY = midY + dx * offset;
    path = `M ${sourceX},${sourceY} Q ${2 * labelX - midX},${2 * labelY - midY} ${targetX},${targetY}`;
  }
  return <BaseEdge id={id} path={path} style={style} label={label} labelX={labelX} labelY={labelY}
    labelStyle={labelStyle} labelBgStyle={labelBgStyle} labelBgPadding={[4, 2]} />;
}

const edgeTypes = { summary: SummaryEdge };

function nodeData(projection: Projection, bead: Bead): BeadNodeData {
  return { bead, expandable: projection.expandable.has(bead.id), hiddenCount: projection.hiddenCounts.get(bead.id) };
}

function nodeSpan({ bead, outsideEpic, hiddenCount }: BeadNodeData): number {
  const title = bead.title.replace(/\s*\([^)]*\)\s*/, "");
  // At 170px wide, 16 characters per line is deliberately conservative. The
  // estimate is uncapped so unusually long titles still reserve enough room.
  const titleLines = Math.max(1, Math.ceil(title.length / 16));
  return 82 + titleLines * 18 + (outsideEpic ? 24 : 0) + (hiddenCount ? 24 : 0);
}

function styledEdges(links: GraphLink[], horizontal: boolean): GraphEdge[] {
  const lanes = new Map<string, number>();
  return links.map(({ id, dependentId, prerequisiteId, type, originalIds }) => {
    const source = horizontal ? prerequisiteId : dependentId;
    const target = horizontal ? dependentId : prerequisiteId;
    const blocking = ACTIVE_BLOCKING_LINK_TYPES.has(type);
    const related = type === "related" || type === "relates-to";
    const style = {
      stroke: blocking ? "#ef4444" : related ? "var(--brand)" : "var(--text-3)",
      strokeWidth: blocking ? 2 : 1.6,
      strokeDasharray: originalIds ? "2 5" : related ? "5 4" : undefined,
    };
    const pair = JSON.stringify(source < target ? [source, target] : [target, source]);
    const lane = lanes.get(pair) ?? 0;
    lanes.set(pair, lane + 1);
    if (!originalIds) return { id, source, target, animated: blocking, style };
    return {
      id, source, target, type: "summary", style,
      label: `Via subtasks · ${type}`,
      ariaLabel: `${source} to ${target}, via subtasks: ${type} (${originalIds.length} ${originalIds.length === 1 ? "link" : "links"})`,
      labelStyle: { fill: "var(--text-2)", fontSize: 10 },
      labelBgStyle: { fill: "var(--surface)" },
      data: { originalIds, lane },
    };
  });
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

function layout(projection: Projection): GraphBeadNode[] {
  const beads = projection.visible;
  const epics = beads.filter((b) => b.issue_type === "epic");

  const nodes: GraphBeadNode[] = [];
  const COL = 250;

  // React Flow keys by node id, so a bead placed twice corrupts the canvas. A
  // bead can reach this loop twice two ways: as a child of two epics, and — the
  // one that's easy to miss — as an epic that is itself another epic's child,
  // which gets pushed once by its parent's iteration and again as its own
  // column. One id set covers both.
  const placedIds = new Set<string>();
  const place = (bead: Bead, x: number, y: number) => {
    const data = nodeData(projection, bead);
    if (!placedIds.has(bead.id)) {
      placedIds.add(bead.id);
      nodes.push({ id: bead.id, type: "bead", position: { x, y }, data });
    }
    return nodeSpan(data);
  };

  epics.forEach((e, ci) => {
    let y = place(e, ci * COL, 0);
    childrenOf(e.id, beads).forEach((child) => {
      y += place(child, ci * COL, y);
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
    const y = looseY[column] ?? 0;
    looseY[column] = y + place(bead, (looseCol + column) * COL, y);
  });

  return nodes;
}

function epicLayout(projection: Projection, outsideIds: Set<string>): GraphBeadNode[] {
  const beads = projection.visible;
  const layers = graphDependencyLayers(beads, projection.links);
  const byLayer = new Map<number, Bead[]>();
  for (const bead of beads) {
    const layer = layers.get(bead.id) ?? 0;
    const current = byLayer.get(layer);
    if (current) current.push(bead);
    else byLayer.set(layer, [bead]);
  }

  const nodes: GraphBeadNode[] = [];
  const COL = 270;
  for (const layer of [...byLayer.keys()].sort((a, b) => a - b)) {
    let y = 0;
    const layerBeads = byLayer.get(layer)!;
    layerBeads.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    for (const bead of layerBeads) {
      const data = { ...nodeData(projection, bead), horizontal: true, outsideEpic: outsideIds.has(bead.id) };
      nodes.push({ id: bead.id, type: "bead", position: { x: layer * COL, y }, data });
      y += nodeSpan(data);
    }
  }
  return nodes;
}

function readFolds(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(saved) && saved.every((id: unknown) => typeof id === "string")
      ? new Set(saved)
      : new Set();
  } catch {
    return new Set();
  }
}

export function GraphView() {
  const { beads, openDetail, projectId, readOnly } = useApp();
  const storageKey = `scotty.graph.folds.${projectId}`;
  const [foldedIds, setFoldedIds] = React.useState(() => readFolds(storageKey));
  const [epicId, setEpicId] = React.useState("");
  const [liveOnly, setLiveOnly] = React.useState(false);
  const [spotlight, setSpotlight] = React.useState(false);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const activateNode = React.useCallback((id: string) => {
    if (spotlight) setFocusId(id);
    else openDetail(id);
  }, [spotlight, openDetail]);
  const toggleFold = React.useCallback((id: string) => {
    const next = new Set(foldedIds);
    if (!next.delete(id)) next.add(id);
    setFoldedIds(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* Keep the current view usable. */ }
  }, [foldedIds, storageKey]);
  const addDep = useAddDep();
  // Recenter/fit the graph on the current nodes (bead mpe).
  const rf = React.useRef<ReactFlowInstance<GraphBeadNode, GraphEdge> | null>(null);
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
  const { source, outsideIds, considered } = React.useMemo(() => {
    const nonArchived = beads.filter((bead) => !(bead.labels ?? []).includes("archived"));
    const scope = effectiveEpicId ? buildEpicGraphScope(nonArchived, effectiveEpicId) : null;
    const scopedBeads = scope?.beads ?? nonArchived;
    return {
      source: liveOnly ? liveGraphBeads(scopedBeads, effectiveEpicId ? new Set([effectiveEpicId]) : undefined) : scopedBeads,
      outsideIds: scope?.outsideIds,
      considered: scopedBeads.length,
    };
  }, [beads, effectiveEpicId, liveOnly]);
  const projection = React.useMemo(() => projectGraph(source, foldedIds), [source, foldedIds]);
  const nodes = React.useMemo(() => outsideIds ? epicLayout(projection, outsideIds) : layout(projection), [projection, outsideIds]);
  const edges = React.useMemo(() => styledEdges(projection.links, !!outsideIds), [projection, outsideIds]);
  const hidden = considered - source.length;
  const selected = focusId === null ? null : projection.representative.get(focusId) ?? null;
  const focus = React.useMemo(() => {
    if (focusId === null || selected === null) return null;
    const { representative } = projection;
    const seeds = selected === focusId
      ? [...representative].filter(([, rep]) => rep === focusId).map(([id]) => id)
      : [focusId];
    const neighborhood = graphNeighborhood(source, seeds);
    return { ...neighborhood, active: new Set([...neighborhood.all].map((id) => representative.get(id)!)) };
  }, [source, projection, focusId, selected]);
  // Styling through context keeps React Flow's measured nodes stable during spotlight.
  const nodeContext = React.useMemo(() => ({ selected, active: focus?.active ?? null, setFocusId, activateNode, toggleFold }),
    [selected, focus, activateNode, toggleFold]);
  const shownEdges = React.useMemo(() => focus ? edges.map((edge) => {
    const lit = edge.data ? edge.data.originalIds.some((id) => focus.edgeIds.has(id)) : focus.edgeIds.has(edge.id);
    const opacity = lit ? 1 : 0.12;
    return {
      ...edge, style: { ...edge.style, opacity }, animated: lit && edge.animated,
      labelStyle: { ...edge.labelStyle, opacity }, labelBgStyle: { ...edge.labelBgStyle, opacity },
    };
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
        {(spotlight || focus) && (
          <div className="flex h-9 basis-full items-center">
            {focus && selected ? (
              <button onClick={() => setFocusId(null)} title="Clear the dependency spotlight"
                className="flex h-9 items-center gap-2 rounded-[9px] bg-[var(--brand-weak)] px-3 text-[12px] text-[var(--brand)]">
                <span className="font-mono">{selected}</span>
                <span>{focus.up} upstream · {focus.down} downstream</span>
                <Icon name="x" size={13} />
              </button>
            ) : <span className="text-[12px] text-[var(--text-3)]">Choose a bead to highlight its blocking chains.</span>}
          </div>
        )}
      </header>
      <div className="relative min-h-0 flex-1">
        <GraphNodeContext.Provider value={nodeContext}>
        <ReactFlow
          key={`${effectiveEpicId || "all"}:${liveOnly ? "live" : "complete"}`}
          nodes={nodes}
          edges={shownEdges}
          zoomOnDoubleClick={!spotlight}
          onPaneClick={() => setFocusId(null)}
          onNodeDoubleClick={(_, node) => { if (spotlight) openDetail(node.id); }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
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
        </GraphNodeContext.Provider>
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
