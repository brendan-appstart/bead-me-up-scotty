// Test the actual view-model modules without a browser or a Beads database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(name) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (id) => id === './schema' ? load('schema') : require(id) });
  return exports;
}
const { isBlocked, blockingDeps, readyHumanGate, makeIndex } = load('beads-view');
const bead = (id, status = 'open', dependencies = []) => ({ id, status, dependencies });
for (const type of ['blocks', 'waits-for', 'conditional-blocks', 'parent-child', 'related', 'supersedes']) {
  for (const status of ['open', 'closed', 'missing']) {
    const b = bead('work', 'open', [{ type, depends_on_id: 'upstream' }]);
    const index = makeIndex(status === 'missing' ? [b] : [b, bead('upstream', status)]);
    const expected = ['blocks', 'waits-for', 'conditional-blocks'].includes(type) && status !== 'closed';
    assert.equal(isBlocked(b, index), expected, `${type} -> ${status}`);
    assert.equal(blockingDeps(b, index).join(','), expected ? 'upstream' : '');
    assert.equal(readyHumanGate({ ...b, issue_type: 'gate', await_type: 'human' }, index), !expected, `human gate ${type} -> ${status}`);
  }
}
assert.equal(isBlocked(bead('manual', 'blocked'), new Map()), true);
for (const status of ['closed', 'deferred', 'in_progress', 'hooked', 'pinned']) {
  assert.equal(isBlocked(bead('inactive', status, [{ type: 'blocks', depends_on_id: 'missing' }]), new Map()), false);
}
console.log('PASS: blocking edge types, closed/missing targets, parent hierarchy, explicit status, and human gate readiness');
