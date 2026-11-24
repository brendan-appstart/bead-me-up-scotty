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
  const { componentOf, components } = dependencyComponents(beads, edgeTypes);
  const ids = [...new Set(beads.map((b) => b.id))].sort();
  assert.deepEqual([...layers.keys()], ids, `${label}: one entry per bead, sorted`);

  const types = new Set(edgeTypes);
  const present = new Set(ids);
  const prereqs = new Map(ids.map((id) => [id, new Set()]));
  for (const b of beads) {
    for (const d of b.dependencies) {
      if (types.has(d.type) && present.has(d.depends_on_id) && d.depends_on_id !== b.id) {
        prereqs.get(b.id).add(d.depends_on_id);
      }
    }
  }
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
  }
}

// Hand-checked fixture: a diamond, a cycle, a hierarchy edge and a dangling id.
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
];
assert.deepEqual(Object.fromEntries(graphDependencyLayers(fixture)), {
  after: 4, aside: 0, child: 1, "cyc-a": 3, "cyc-b": 3, join: 2, left: 1, right: 1, root: 0,
});
assert.equal(graphDependencyLayers(fixture, FLOW_DEP_TYPES).get("child"), 0, "flow types leave hierarchy out");

for (const edgeTypes of [BLOCKING_DEP_TYPES, FLOW_DEP_TYPES]) {
  checkDefinition(fixture, edgeTypes, `fixture/${edgeTypes.length}`);
  for (let seed = 1; seed <= 200; seed++) {
    const beads = randomGraph(seed, 5 + (seed % 60));
    const label = `seed ${seed}/${edgeTypes.length}`;
    checkDefinition(beads, edgeTypes, label);
    const shuffled = [...beads].sort(() => rng(seed)() - 0.5).reverse();
    assert.deepEqual([...graphDependencyLayers(shuffled, edgeTypes)], [...graphDependencyLayers(beads, edgeTypes)], `${label}: input order does not matter`);
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
