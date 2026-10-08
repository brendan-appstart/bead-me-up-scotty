# Plan: Graph page filtering — hide closed by default, search, assignee, labels

## Goal

Make the Dependency graph usable on real projects: hide closed beads by default,
and let users narrow the canvas by search text, assignee, and label.

## Architecture

Single React component (`components/graph-view.tsx`) plus its three Playwright
regression scripts. Filtering is composed as a pure reduction over the bead list
before the existing layout functions run; no new files and no shared-library
changes.

Pipeline: `nonArchived → matchesFilters(search/assignee/labels) → [epic scope] →
[live-only prune] → layout`.

## Tech Stack

Next.js 16 (App Router, client components), React 19, TypeScript, `@xyflow/react`
v12, Tailwind v4 tokens, `@base-ui/react` dropdowns, Playwright regression scripts
run against an isolated demo server.

## Global Constraints (verbatim from the spec)

- **Closed hidden by default via the existing toggle.** "Live dependencies only"
  flips its default to **checked**. Keep the checkbox so unchecking still reveals
  the full graph (closed + unlinked beads).
- **Controls added:** a **search box** (id / title / labels / assignee) plus
  **Assignee** and **Labels** multi-select dropdowns.
- **Graph-local state.** Filters are **not** written to the URL and not shared with
  Board/List.
- **Scoped epic stays visible as an anchor**, even if it doesn't match the filters.
- **Re-fit the viewport when the visible node set changes.**

Out of scope: URL/bookmark persistence; Status/Type/Priority/Origin facets on the
graph; changes to Board/List or `lib/filters.ts`; dimming non-matches instead of
filtering; persisting the live toggle/filters across sessions.

## Objective

Default graph shows only live, non-closed beads; search/assignee/label controls
narrow it live with a visible count of hidden beads and a recovery path; all three
graph regression scripts pass.

## Model Guidance

- `default_model_class`: `standard_impl`
- `phase_guidance`: `brainstorm: high_reasoning`, `design: high_reasoning`,
  `plan: standard_impl`, `implement: standard_impl`, `verify: standard_impl`,
  `review: high_reasoning`, `docs: cheap_simple`
- `override_rule`: Use `high_reasoning` for planning only when execution boundaries,
  dependency sequencing, or major tradeoffs are still unresolved.

## Requirement Analysis

- Problem: the graph renders every non-archived bead (closed included) and offers no
  search or assignee/label filtering, so real projects look like a wall of nodes.
- Success criteria: closed and unlinked beads hidden on first render; search matches
  id/title/labels/assignee; Assignee and Labels dropdowns narrow the set; Clear and
  "Show all beads" recover; the three graph E2E scripts pass; lint/typecheck/build
  clean.
- Constraints: no URL state; reuse `lib/filters.ts` matching; don't change
  Board/List or `lib/filters.ts`.
- Non-goals: see Global Constraints (out of scope).

## Approach Options

### Option 1: Reuse the shared filter model (selected)

- Summary: derive a `Filters` object from local state and filter with the existing
  `matchesFilters`; reuse `MultiSelectFilter` and `labelOptionsFrom`/
  `assigneeOptionsFrom`.
- Pros: identical matching semantics to Board/List; no new code paths; small diff.
- Cons: one extra object allocation per render (negligible).

### Option 2: Bespoke matcher and dropdowns

- Summary: hand-roll substring matching and custom dropdown UI in the graph.
- Pros: none material.
- Cons: duplicates `lib/filters.ts`, drifts from Board/List behavior, more code.

## Recommended Approach

- Selected option: Option 1.
- Reasoning: the shared filter model already implements exactly the requested
  search scope (id/title/labels/assignee) and assignee/label facets; reuse keeps the
  change small and consistent with the rest of the app (DRY, YAGNI).

## Scope

- In scope: `components/graph-view.tsx`, `scripts/test-graph.mjs`,
  `scripts/test-graph-epic.mjs`, `scripts/test-graph-spotlight.mjs`.
- Out of scope: everything in Global Constraints' out-of-scope list.

## Execution Strategy

```yaml
execution_strategy:
  mode: direct
  workers:
    mode: sequential
  rationale: Two sequential tracks that edit the same component and its E2E tests; fewer than three tasks and no independent parallel work.
```

## Tasks

### Track 1: Hide closed and unlinked beads by default

- **Dependencies**: none
- **Files**:
  - `components/graph-view.tsx` (modify line 236)
  - `scripts/test-graph.mjs` (modify lines 51–59, 77–84, 86–89, 127)
  - `scripts/test-graph-epic.mjs` (modify lines 62, 65)
  - `scripts/test-graph-spotlight.mjs` (modify line 58)
- **Provider role**: `frontend`
- **Reasoning**: `medium`
- **Acceptance criteria**: opening the Graph hides closed and unlinked beads; the
  three graph E2E scripts pass with the updated expectations.
- **Estimated complexity**: low

**Step 1.1 — flip the default.** In `components/graph-view.tsx` line 236:

```tsx
// before
const [liveOnly, setLiveOnly] = React.useState(false);
// after
const [liveOnly, setLiveOnly] = React.useState(true);
```

**Step 1.2 — `scripts/test-graph.mjs` default assertion** (replace lines 51–59):

```js
  const ids = () => page.locator(".react-flow__node").evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-id")).sort());
  // "Live dependencies only" is checked by default, so closed and unlinked beads
  // are pruned on first render.
  await page.locator('.react-flow__node[data-id="finished"]').waitFor({ state: "detached" });
  assert.deepEqual(await ids(), ["child", "epic", "linked-a", "linked-b", "nested"],
    "Default graph must hide closed and unlinked beads");
  const filter = page.getByRole("checkbox", { name: "Live dependencies only" });
  await filter.uncheck();
  await page.locator('.react-flow__node[data-id="finished"]').waitFor();
  assert.deepEqual(await ids(), beads.filter((b) => b.id !== "archived").map((b) => b.id).sort(),
    "Unchecking must restore closed and unlinked beads exactly once");
```

**Step 1.3 — `scripts/test-graph.mjs` empty-state recovery** (replace lines 77–84):

```js
  beads.splice(0, beads.length, bead("unlinked"), bead("completed", { status: "closed" }));
  await page.reload();
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  // Default live-only hides both beads, so the empty state must offer recovery.
  await page.getByRole("button", { name: "Show all beads", exact: true }).waitFor();
  await page.getByRole("button", { name: "Show all beads", exact: true }).click();
  await page.locator('.react-flow__node[data-id="completed"]').waitFor();
  assert.deepEqual(await ids(), ["completed", "unlinked"], "Empty filter must offer recovery");
```

**Step 1.4 — `scripts/test-graph.mjs` loose-wrap fixture** (insert after line 88's
Graph click, before the `loose-39` wait):

```js
  // Loose beads are unlinked, so reveal them before the wrapping assertions.
  await page.getByRole("checkbox", { name: "Live dependencies only" }).uncheck();
```

**Step 1.5 — `scripts/test-graph.mjs` final log** (line 127): change the message to
`"PASS: default pruning, opt-in full graph, unique nested epics, drag-to-link, closed-task details, empty-filter recovery, and wrapped layout"`.

**Step 1.6 — `scripts/test-graph-epic.mjs` (two edits).**

Line 62: the `graph()` helper waits for `solo`, which is unlinked and now hidden;
wait for a live node instead:

```js
  const graph=async()=>{await page.goto(`${base}/p/demo`);await page.getByRole('button',{name:'Graph',exact:true}).click();await node('child').waitFor();};
```

Line 65: uncheck live-only before asserting the complete graph, so every later
whole-graph check (including the closed-epic scope block at lines 91–97, which expects
to start from the unpruned graph) stays valid:

```js
  assert.equal(await scope().inputValue(),'','whole graph is the default');
  await page.getByRole('checkbox',{name:'Live dependencies only',exact:true}).uncheck();
  assert.deepEqual(await ids(),beads.filter(b=>b.id!=='archived').map(b=>b.id).sort());
```

No other edits in this file: with the toggle unchecked from line 65 onward, the
existing closed-epic scope block (91–97) and the link-direction block (100+) keep
their original expectations.

**Step 1.7 — `scripts/test-graph-spotlight.mjs` (one edit).**

Replace line 58's `await node("a").waitFor();` with the block below. The graph now
opens with live-only checked, which hides `closed-target` and `loose`; waiting for
`child` (linked) proves readiness, and unchecking live-only restores every bead so the
rest of the off-mode assertions (lines 63–117, including the `closed-target`
dim/restore checks) keep their original expectations:

```js
  await node("child").waitFor();
  await page.getByRole("checkbox", { name: "Live dependencies only", exact: true }).uncheck();
```

No other edits: with live-only unchecked from line 58 onward, the existing
filtered-selection block at lines 119–128 still exercises `.check()` correctly (it
starts unchecked, prunes `closed-target`, and asserts the surviving chain is not
dimmed).

### Track 2: Search, assignee, and label filters

- **Dependencies**: Track 1
- **Files**:
  - `components/graph-view.tsx` (modify imports; lines 234–238, 248–276, 327,
    333–350, 410–431)
  - `scripts/test-graph.mjs` (modify lines 14–21; insert before line 77)
- **Provider role**: `frontend`
- **Reasoning**: `medium`
- **Acceptance criteria**: the graph header exposes a search box, an Assignee
  dropdown, a Labels dropdown, and a "Clear · n" button; typing or selecting
  narrows the canvas; the empty state offers Clear filters / Show all beads as
  applicable; `scripts/test-graph.mjs` passes.
- **Estimated complexity**: medium

**Step 2.1 — imports.** After `import type { Bead } from "@/lib/schema";` (line 22),
add:

```tsx
import { MultiSelectFilter } from "@/components/multi-select-filter";
import {
  matchesFilters,
  labelOptionsFrom,
  assigneeOptionsFrom,
  toggleStr,
  type Filters,
} from "@/lib/filters";
```

**Step 2.2 — read `humanAllowlist` and add filter state** (replace lines 234–238):

```tsx
  const { beads, openDetail, readOnly, humanAllowlist } = useApp();
  const [epicId, setEpicId] = React.useState("");
  const [liveOnly, setLiveOnly] = React.useState(true);
  const [spotlight, setSpotlight] = React.useState(false);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [assignees, setAssignees] = React.useState<string[]>([]);
  const [labels, setLabels] = React.useState<string[]>([]);
```

**Step 2.3 — derived options, filter model, clear.** Insert after the `epics`
`useMemo` (after line 257):

```tsx
  const labelOptions = React.useMemo(() => labelOptionsFrom(beads), [beads]);
  const assigneeOptions = React.useMemo(() => assigneeOptionsFrom(beads), [beads]);
  const filters: Filters = React.useMemo(
    () => ({
      status: [],
      type: [],
      priority: [],
      origin: [],
      labels,
      assignee: assignees,
      search,
    }),
    [labels, assignees, search],
  );
  const filterCount =
    (search.trim() ? 1 : 0) + (assignees.length ? 1 : 0) + (labels.length ? 1 : 0);
  const clearFilters = React.useCallback(() => {
    setSearch("");
    setAssignees([]);
    setLabels([]);
    setFocusId(null);
  }, []);
```

**Step 2.4 — filter pipeline** (replace lines 262–276):

```tsx
  const { nodes, edges, considered } = React.useMemo(() => {
    const nonArchived = beads.filter((bead) => !(bead.labels ?? []).includes("archived"));
    const matched = nonArchived.filter((bead) => matchesFilters(bead, filters, humanAllowlist));
    if (effectiveEpicId) {
      // Keep the scoped epic visible even when it doesn't match the filters, so the
      // user retains scope context.
      const anchor = nonArchived.find((bead) => bead.id === effectiveEpicId);
      const pool =
        !anchor || matched.some((bead) => bead.id === effectiveEpicId)
          ? matched
          : [anchor, ...matched];
      const scope = buildEpicGraphScope(pool, effectiveEpicId);
      const visible = liveOnly
        ? liveGraphBeads(scope.beads, new Set([effectiveEpicId]))
        : scope.beads;
      return {
        ...epicLayout(visible, activateNode, scope.outsideIds),
        considered: scope.beads.length,
      };
    }
    const visible = liveOnly ? liveGraphBeads(matched) : matched;
    return { ...layout(visible, activateNode), considered: matched.length };
  }, [beads, activateNode, effectiveEpicId, liveOnly, filters, humanAllowlist]);
```

**Step 2.5 — re-fit on visible-set change.** Insert immediately after the pipeline
memo (after line 276, before the `const hidden = …` line):

```tsx
  const visibleIds = React.useMemo(
    () => nodes.map((node) => node.id).sort().join("|"),
    [nodes],
  );
  const previousVisibleIds = React.useRef(visibleIds);
  React.useEffect(() => {
    if (previousVisibleIds.current === visibleIds) return;
    previousVisibleIds.current = visibleIds;
    center();
  }, [visibleIds, center]);
```

**Step 2.6 — header controls.** Insert the search box after the title `</div>`
(line 333), before the epic `<select>` (line 334):

```tsx
        <div className="flex h-9 w-[220px] flex-shrink-0 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[11px]">
          <Icon name="search" size={15} className="flex-shrink-0 text-[var(--text-3)]" />
          <input
            data-search
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setFocusId(null);
            }}
            placeholder="Search beads…  (/)"
            className="w-full border-none bg-transparent text-[13px] text-[var(--text)] outline-none"
          />
        </div>
```

Insert the filters after the `</select>` (line 350), before the Spotlight `<label>`
(line 351):

```tsx
        {assigneeOptions.length > 0 && (
          <MultiSelectFilter
            label="Assignee"
            options={assigneeOptions}
            selected={assignees}
            onToggle={(v) => {
              setAssignees((current) => toggleStr(current, v));
              setFocusId(null);
            }}
            onClear={() => setAssignees([])}
          />
        )}
        {labelOptions.length > 0 && (
          <MultiSelectFilter
            label="Labels"
            options={labelOptions}
            selected={labels}
            onToggle={(v) => {
              setLabels((current) => toggleStr(current, v));
              setFocusId(null);
            }}
            onClear={() => setLabels([])}
          />
        )}
        {filterCount > 0 && (
          <button
            onClick={clearFilters}
            title="Clear all filters"
            className="flex h-9 flex-shrink-0 items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[11px] text-[12.5px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)]"
          >
            <Icon name="x" size={14} />
            <span>Clear · {filterCount}</span>
          </button>
        )}
```

**Step 2.7 — hidden-count tooltip** (line 327). Replace the `title` on the
`hidden by filter` span:

```tsx
                <span title="Hidden by the live-dependencies filter or your search/assignee/label filters.">
```

**Step 2.8 — empty state** (replace lines 410–431):

```tsx
        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="pointer-events-auto max-w-[360px] rounded-[12px] border border-border bg-[var(--surface)] p-[16px_18px] text-center shadow-[var(--shadow)]">
              <div className="text-[13px] font-[650] text-[var(--text)]">
                {considered === 0
                  ? "No beads to show"
                  : filterCount > 0
                    ? "No beads match your filters"
                    : "No live dependencies"}
              </div>
              <p className="m-0 mt-[6px] text-[12px] leading-[1.5] text-[var(--text-2)]">
                {considered === 0
                  ? "There are no non-archived beads in this project."
                  : filterCount > 0
                    ? "No bead matches the current search, assignee, or label filters."
                    : "The current filter hides all beads. Show all beads to inspect completed work or create new dependencies."}
              </p>
              {considered > 0 && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  {filterCount > 0 && (
                    <button
                      onClick={clearFilters}
                      className="rounded-lg border border-border px-3 py-1.5 text-[12px] hover:bg-[var(--surface-2)]"
                    >
                      Clear filters
                    </button>
                  )}
                  {liveOnly && (
                    <button
                      onClick={() => setLiveOnly(false)}
                      className="rounded-lg border border-border px-3 py-1.5 text-[12px] hover:bg-[var(--surface-2)]"
                    >
                      Show all beads
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
```

**Step 2.9 — `scripts/test-graph.mjs` fixture** (replace lines 14–21):

```js
const beads = [
  bead("new-a"), bead("new-b"), bead("finished", { status: "closed" }),
  bead("linked-a", { assignee: "alice", dependencies: [dep("linked-a", "linked-b")] }),
  bead("linked-b", { labels: ["infra"] }),
  bead("epic", { issue_type: "epic" }),
  bead("nested", { issue_type: "epic", dependencies: [dep("nested", "epic", "parent-child")] }),
  bead("child", { dependencies: [dep("child", "nested", "parent-child")] }),
  bead("archived", { labels: ["archived"] }),
];
```

**Step 2.10 — `scripts/test-graph.mjs` filter assertions.** Insert after the
close-details block (after line 75), before the fixture-B splice (line 77):

```js
  // Search matches id/title/labels/assignee; the assignee and label facets narrow
  // the same set; Clear restores it.
  const search = page.locator('input[data-search]');
  await search.fill('linked');
  assert.deepEqual(await ids(), ['linked-a', 'linked-b'], 'Search must match bead ids');
  await search.fill('');
  await page.getByRole('button', { name: /^Assignee/ }).click();
  await page.getByRole('menuitemcheckbox', { name: 'alice' }).click();
  await page.keyboard.press('Escape');
  assert.deepEqual(await ids(), ['linked-a'], 'Assignee filter must narrow to one owner');
  await page.getByRole('button', { name: /^Assignee/ }).click();
  await page.getByRole('menuitemcheckbox', { name: 'alice' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Labels/ }).click();
  await page.getByRole('menuitemcheckbox', { name: 'infra' }).click();
  await page.keyboard.press('Escape');
  assert.deepEqual(await ids(), ['linked-b'], 'Label filter must narrow by exact label');
  await page.getByRole('button', { name: /^Clear/ }).click();
  assert.deepEqual(await ids(), beads.filter((b) => b.id !== 'archived').map((b) => b.id).sort(),
    'Clear must restore every bead');
```

## Beads

- **Parent Bead (epic):** "Graph filtering: hide closed by default, search,
  assignee, labels" — the deliverable; remains open until human-confirmed merge.
- **Track 1 bead:** "Hide closed and unlinked beads by default in the graph" —
  closes after its tests and review pass.
- **Track 2 bead:** "Add search, assignee, and label filters to the graph" —
  depends on Track 1; closes after its tests and review pass.

## Integration

- **Branch**: `feat/graph-filters` (already carries the approved spec commit
  `088eb6f`)
- **Merge strategy**: sequential (Track 1 then Track 2 on the same branch)

## Validation

- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` succeeds
- [ ] Graph regression scripts pass against an isolated demo server:

```bash
npm run build
XDG_CONFIG_HOME=/tmp/scotty-graph-test POSTHOG_KEY='' BEADS_DEMO=1 \
  npm run start -- --port 3197 &
SCOTTY_TEST_URL=http://localhost:3197 node scripts/test-graph.mjs
SCOTTY_TEST_URL=http://localhost:3197 node scripts/test-graph-epic.mjs
SCOTTY_TEST_URL=http://localhost:3197 node scripts/test-graph-spotlight.mjs
```

- [ ] Manual: open Graph → only live beads show; uncheck "Live dependencies only"
      → closed beads reappear; type in search → canvas re-fits to matches; pick an
      assignee and a label → graph narrows; Clear resets; a search matching nothing
      offers "Clear filters".

## Notes

- Model guidance is planning metadata, not Beads state.
- Every implementation track names the `frontend` provider role and `medium`
  reasoning; review uses the configured `review` role at `high_reasoning`.
- `getByRole('menuitemcheckbox', …)` assumes Base UI's `Menu.CheckboxItem` renders
  the WAI-ARIA checkbox-menuitem role. If the E2E selector does not resolve, fall
  back to `page.getByText('alice', { exact: true })` (and `'infra'`), which targets
  the same dropdown option.
- Concrete providers and models are resolved from machine-local configuration during
  orchestration; they never belong in this plan.
- Deliverable merge-holds apply only to the Parent Bead; track beads close upon
  passing tests and review so dependents unblock.

