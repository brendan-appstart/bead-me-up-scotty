// Exercise the dependency search model without a server or database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/dep-picker.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { filterDepCandidates } = exports;
const beads = [
  { id: 'work-10', title: 'Deploy worker', status: 'closed' },
  { id: 'self', title: 'Deploy current' },
  { id: 'work-2', title: 'Deploy API' },
  { id: 'linked', title: 'Deploy existing dependency' },
  { id: 'parent', title: 'Deploy parent' },
  { id: 'a-reference', title: 'Follow up on work-2' },
];
const before = JSON.stringify(beads);
const options = { currentId: 'self', linkedIds: ['linked', 'parent'] };
const ids = query => Array.from(filterDepCandidates(beads, query, options), bead => bead.id);
assert.deepEqual(ids(''), ['a-reference', 'work-2', 'work-10'], 'natural ID order; self and all outgoing links excluded');
assert.deepEqual(ids('  DEPLOY  '), ['work-2', 'work-10'], 'trimmed case-insensitive title search retains closed beads');
assert.deepEqual(ids('WORK-2'), ['work-2', 'a-reference'], 'exact ID outranks a title reference');
assert.deepEqual(ids('absent'), [], 'unmatched search is empty');
assert.deepEqual(ids('self'), [], 'search cannot reintroduce self');
assert.equal(JSON.stringify(beads), before, 'filtering and sorting do not mutate the project cache');
const many = Array.from({ length: 205 }, (_, i) => ({ id: `bead-${i}`, title: 'Available task' }));
assert.equal(filterDepCandidates(many, '', { currentId: 'none', linkedIds: [] }).length, 205, 'every eligible result remains accessible');
console.log('PASS: dependency ID/title search, exact-ID ranking, natural ordering, self/duplicate exclusion, closed targets, complete results, and immutable input');
