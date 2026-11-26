import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(name, require = (id) => { throw new Error(`Unexpected import: ${id}`); }) {
  const exports = {};
  const source = readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInThisContext(`(function(exports, require) {${outputText}\n})`)(exports, require);
  return exports;
}

const collapse = load("graph-collapse");
const { projectGraph } = collapse;
const { graphNeighborhood } = load("graph-neighborhood", (id) => {
  assert.equal(id, "./graph-collapse");
  return collapse;
});
const dep = (depends_on_id, type = "parent-child") => ({ depends_on_id, type });
const bead = (id, ...dependencies) => ({ id, status: "open", dependencies });
const source = [
  bead("a"), bead("b", dep("a"), dep("y", "blocks")),
  bead("c", dep("b")), bead("d", dep("b"), dep("y", "blocks"), dep("y", "related")),
  bead("e", dep("b"), dep("w", "blocks"), dep("d", "related")), bead("f", dep("b")),
  bead("x", dep("c", "blocks"), dep("c", "blocks"), dep("f", "blocks")),
  bead("y"), bead("z", dep("e", "blocks")), bead("w"),
];
const fold = (...ids) => projectGraph(source, new Set(ids));
const unfolded = fold();
assert.deepEqual(unfolded.visible, source);
assert.deepEqual([...unfolded.expandable].sort(), ["a", "b"]);
assert.equal(unfolded.hiddenCounts.size, 0);
assert.equal(unfolded.links.filter((link) => link.id === "x->c:blocks").length, 1);

const inner = fold("b");
assert.deepEqual(inner.visible.map(({ id }) => id), ["a", "b", "x", "y", "z", "w"]);
assert.deepEqual([...inner.hiddenCounts], [["b", 4]]);
assert.equal(inner.representative.get("d"), "b");
assert.ok(inner.links.some(({ id }) => id === "b->a:parent-child"));
assert.ok(inner.links.some(({ id, originalIds }) => id === "b->y:blocks" && !originalIds));
assert.deepEqual(inner.links.filter(({ originalIds }) => originalIds).map(({ dependentId, prerequisiteId, type, originalIds }) =>
  [dependentId, prerequisiteId, type, originalIds]), [
  ["b", "y", "blocks", ["d->y:blocks"]],
  ["b", "y", "related", ["d->y:related"]],
  ["b", "w", "blocks", ["e->w:blocks"]],
  ["x", "b", "blocks", ["x->c:blocks", "x->f:blocks"]],
  ["z", "b", "blocks", ["z->e:blocks"]],
]);
assert.deepEqual([...fold("a", "b").hiddenCounts], [["a", 5]]);
assert.equal(fold("a", "b").representative.get("d"), "a");

const projectedWalk = (seed) => {
  const walk = graphNeighborhood(source, [seed]);
  return {
    nodes: [...new Set([...walk.all].map((id) => inner.representative.get(id)))].sort(),
    links: inner.links.filter((link) => (link.originalIds ?? [link.id]).some((id) => walk.edgeIds.has(id))),
  };
};
assert.deepEqual(projectedWalk("x").nodes, ["b", "x"], "shared representatives do not create a path to y");
assert.deepEqual(projectedWalk("x").links.map(({ originalIds }) => originalIds), [["x->c:blocks", "x->f:blocks"]]);
assert.deepEqual(projectedWalk("z").nodes, ["b", "w", "z"], "a real path through e still reaches w");
assert.deepEqual(projectedWalk("z").links.map(({ originalIds }) => originalIds), [["e->w:blocks"], ["z->e:blocks"]]);

const unusualHierarchy = [
  bead("a", dep("b")), bead("b", dep("a")), bead("q"),
  bead("child", dep("q"), dep("b"), dep("b")),
  bead("self", dep("self")),
];
const malformed = (beads) => projectGraph(beads, new Set(["a", "b", "q", "self"]));
const first = malformed(unusualHierarchy);
assert.deepEqual(Object.fromEntries(first.representative), { a: "a", b: "a", q: "q", child: "a", self: "self" });
assert.equal(first.links.length, 0, "do not invent a hierarchy edge from a to q or keep a self link");
const reordered = [...unusualHierarchy].reverse().map((bead) => ({ ...bead, dependencies: [...bead.dependencies].reverse() }));
assert.deepEqual(Object.fromEntries(malformed(reordered).representative), Object.fromEntries(first.representative));
const cross = [bead("a"), bead("b"), bead("a1", dep("a"), dep("b1", "blocks")), bead("b1", dep("b"), dep("a1", "blocks"))];
assert.deepEqual(projectGraph(cross, new Set(["a", "b"])).links.map(({ dependentId, prerequisiteId }) => [dependentId, prerequisiteId]), [["a", "b"], ["b", "a"]]);

const deep = Array.from({ length: 20_000 }, (_, index) => bead(`deep-${index}`, ...(index ? [dep(`deep-${index - 1}`)] : [])));
assert.equal(projectGraph(deep, new Set(["deep-0"])).hiddenCounts.get("deep-0"), deep.length - 1);
console.log("PASS: graph folding, summary links, original spotlight paths, and malformed/deep hierarchy");
