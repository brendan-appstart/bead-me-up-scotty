// Pins graphDependencyLayers() to its definition, so refactors of the shared
// dependency code cannot move a Graph node. Pure: no server, no browser.
//   node scripts/test-graph-layers.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(name) {
  const exports = {};
  const source = readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (id) => (id === "./schema" ? load("schema") : require(id)) });
  return exports;
}

const { graphDependencyLayers, dependencyComponents } = load("graph-epic");
const { BLOCKING_DEP_TYPES, FLOW_DEP_TYPES } = load("schema");

const bead = (id, deps = []) => ({
  id,
  title: id,
  status: "open",
  issue_type: "task",
  priority: 2,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  labels: [],
  dependencies: deps.map(([depends_on_id, type]) => ({ depends_on_id, type })),
});

// Deterministic PRNG so a failure always reproduces.
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
// Seeded Fisher-Yates: one generator advanced across swaps.
function shuffle(items, seed) {
  const r = rng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const DEP_TYPES = ["blocks", "conditional-blocks", "waits-for", "parent-child", "related"];
function randomGraph(seed, size) {
  const r = rng(seed);
  return Array.from({ length: size }, (_, i) => {
    const deps = [];
    const n = Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      // Mostly backwards edges (a DAG), with some forward ones to make cycles
      // and some to ids that are not on the board.
      const roll = r();
      const target = roll < 0.05 ? `missing-${i}` : `b${Math.floor(r() * size)}`;
      deps.push([target, DEP_TYPES[Math.floor(r() * DEP_TYPES.length)]]);
    }
    return bead(`b${i}`, deps);
  });
}

/**
 * The definition the layers must satisfy, checked independently of how they
 * are computed: beads in one strongly connected component share a layer, and
 * every other bead sits exactly one past its latest prerequisite (0 if none).
 */
function checkDefinition(beads, edgeTypes, label) {
  const layers = graphDependencyLayers(beads, edgeTypes);
  const { componentOf, components, cyclic, componentEdges } = dependencyComponents(beads, edgeTypes);
  const ids = [...new Set(beads.map((b) => b.id))].sort();
  assert.deepEqual([...layers.keys()], ids, `${label}: one entry per bead, sorted`);

  const types = new Set(edgeTypes);
  const present = new Set(ids);
  const prereqs = new Map(ids.map((id) => [id, new Set()]));
  const selfLoops = new Set();
  for (const b of beads) {
    for (const d of b.dependencies) {
      if (!types.has(d.type) || !present.has(d.depends_on_id)) continue;
      if (d.depends_on_id === b.id) selfLoops.add(b.id);
      else prereqs.get(b.id).add(d.depends_on_id);
    }
  }

  // Condensed edges, derived straight from the input dependencies.
  const expectedEdges = new Set();
  for (const [id, ps] of prereqs) {
    for (const p of ps) {
      const from = componentOf.get(p);
      const to = componentOf.get(id);
      if (from !== to) expectedEdges.add(`${from}>${to}`);
    }
  }
  const actualEdges = [...componentEdges].flatMap(([from, targets]) => [...targets].map((to) => `${from}>${to}`));
  assert.deepEqual(actualEdges.sort(), [...expectedEdges].sort(), `${label}: condensed edges match the dependencies`);
  for (const members of components) {
    const layer = layers.get(members[0]);
    for (const id of members) assert.equal(layers.get(id), layer, `${label}: cycle ${members} shares a layer`);
    const inside = new Set(members);
    let expected = 0;
    for (const id of members) {
      for (const p of prereqs.get(id)) {
        if (!inside.has(p)) expected = Math.max(expected, layers.get(p) + 1);
      }
    }
    assert.equal(layer, expected, `${label}: ${members} is one past its latest prerequisite`);
    for (const id of members) assert.equal(components[componentOf.get(id)], members);
    const isCycle = members.length > 1 || selfLoops.has(members[0]);
    assert.equal(cyclic[componentOf.get(members[0])], isCycle, `${label}: ${members} cyclic is ${isCycle}`);
  }
}

// Hand-checked fixture: a diamond, a cycle, a self-loop, a hierarchy edge and
// a dangling id.
const fixture = [
  bead("root"),
  bead("left", [["root", "blocks"]]),
  bead("right", [["root", "waits-for"]]),
  bead("join", [["left", "blocks"], ["right", "conditional-blocks"]]),
  bead("cyc-a", [["join", "blocks"], ["cyc-b", "blocks"]]),
  bead("cyc-b", [["cyc-a", "blocks"]]),
  bead("after", [["cyc-b", "blocks"], ["gone", "blocks"]]),
  bead("child", [["root", "parent-child"]]),
  bead("aside", [["root", "related"]]),
  bead("selfish", [["selfish", "blocks"], ["root", "blocks"]]),
];
assert.deepEqual(Object.fromEntries(graphDependencyLayers(fixture)), {
  after: 4, aside: 0, child: 1, "cyc-a": 3, "cyc-b": 3, join: 2, left: 1, right: 1, root: 0, selfish: 1,
});
assert.equal(graphDependencyLayers(fixture, FLOW_DEP_TYPES).get("child"), 0, "flow types leave hierarchy out");
{
  const { componentOf, cyclic } = dependencyComponents(fixture);
  const isCyclic = (id) => cyclic[componentOf.get(id)];
  assert.equal(isCyclic("selfish"), true, "a self-loop is a cycle");
  assert.equal(isCyclic("cyc-a"), true, "a two-bead loop is a cycle");
  assert.equal(isCyclic("root"), false, "a plain bead is not a cycle");
}

for (const edgeTypes of [BLOCKING_DEP_TYPES, FLOW_DEP_TYPES]) {
  checkDefinition(fixture, edgeTypes, `fixture/${edgeTypes.length}`);
  for (let seed = 1; seed <= 200; seed++) {
    const beads = randomGraph(seed, 5 + (seed % 60));
    const label = `seed ${seed}/${edgeTypes.length}`;
    checkDefinition(beads, edgeTypes, label);
    const shuffled = shuffle(beads, seed);
    assert.notDeepEqual(shuffled.map((b) => b.id), beads.map((b) => b.id), `${label}: shuffle changed the order`);
    assert.deepEqual(dependencyComponents(shuffled, edgeTypes), dependencyComponents(beads, edgeTypes), `${label}: input order does not matter`);
  }
}

// Topological order puts every prerequisite component before its dependents.
{
  const { componentEdges, topologicalOrder, components } = dependencyComponents(randomGraph(7, 80));
  assert.equal(topologicalOrder.length, components.length);
  const position = new Map(topologicalOrder.map((c, i) => [c, i]));
  for (const [from, targets] of componentEdges) {
    for (const to of targets) assert.ok(position.get(from) < position.get(to));
  }
}

console.log("graph layers: ok");
