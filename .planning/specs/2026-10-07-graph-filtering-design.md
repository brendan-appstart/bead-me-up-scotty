# Graph page filtering — hide closed by default, search, assignee, labels

**Status:** draft · **Date:** 2026-10-07

## Problem

The Dependency graph (`components/graph-view.tsx`) renders **every** non-archived
bead by default, closed ones included, which makes most real projects look like an
undifferentiated wall of nodes. It also has no way to search beads on this screen
and no filter by assignee or label. Users must scroll/zoom and click through the
canvas to find a specific bead.

## Decisions (locked with the user)

1. **Closed hidden by default via the existing toggle.** The current
   "Live dependencies only" checkbox (off by default) already hides closed beads
   *and* open-but-unlinked beads. Rather than add a second toggle, flip its default
   to **checked**. Keep the checkbox so unchecking still reveals the full graph
   (closed + unlinked beads). This is the smallest change and exactly meets
   "hide closed by default, show when enabled".
2. **Controls added:** a **search box** (matches id / title / labels / assignee,
   identical logic to Board & List) plus **Assignee** and **Labels**
   multi-select dropdowns.
3. **Graph-local state.** The new filters live in the `GraphView` component only —
   they are **not** written to the URL and are not shared with Board/List. The
   graph's other controls (epic scope, spotlight, live toggle) are likewise local.
4. **Scoped epic stays visible as an anchor.** When scoped to an epic, the epic
   node itself remains rendered even if it doesn't match the active filters, so the
   user keeps scope context (mirrors how `liveOnly` already pins the epic).
5. **Re-fit the viewport when the visible node set changes**, so filtered-in nodes
   never land off-screen after a search narrows the graph.

## Architecture

All behaviour changes land in **`components/graph-view.tsx`**, reusing existing
primitives rather than adding new ones:

- `lib/filters.ts` — `matchesFilters(b, filters, humanAllowlist)`,
  `labelOptionsFrom(beads)`, `assigneeOptionsFrom(beads)`, the `Filters` type, and
  `UNASSIGNED` ("Unassigned" option).
- `components/multi-select-filter.tsx` — `MultiSelectFilter`, the same dropdown used
  by `FilterBar` on Board/List.
- `components/filter-bar.tsx` — reuse its search input styling and the
  `data-search` attribute, which the global `/` shortcut already focuses
  (`hooks/use-app-keyboard.ts`).

No new files. No changes to Board/List or to `lib/filters.ts`.

### State

| State | Change | Default |
|---|---|---|
| `liveOnly` | existing; initial value `false` → `true` | `true` (checked) |
| `search` | **new**, `string` | `""` |
| `assignees` | **new**, `string[]` | `[]` |
| `labels` | **new**, `string[]` | `[]` |
| `epicId`, `spotlight`, `focusId` | unchanged | — |

A `Filters` object is derived from these (`status/type/priority/origin` empty so no
hidden facets apply):

```ts
const filters: Filters = { status: [], type: [], priority: [], origin: [],
                           labels, assignee: assignees, search };
```

Option lists are derived from **all** beads (not the filtered set) — same as
Board/List — so selecting a label/assignee doesn't make the other options vanish:
`labelOptionsFrom(beads)`, `assigneeOptionsFrom(beads)`.

### Filter pipeline

Inside the existing `useMemo` that currently builds `{ nodes, edges, considered }`:

```
nonArchived = beads.filter(not "archived")
matched     = nonArchived.filter(b => matchesFilters(b, filters, humanAllowlist))
if scoped to epic:
    scope   = buildEpicGraphScope(matched, effectiveEpicId)
    visible = liveOnly ? liveGraphBeads(scope.beads, new Set([effectiveEpicId]))
                       : scope.beads
    considered = scope.beads.length
else:
    visible = liveOnly ? liveGraphBeads(matched) : matched
    considered = matched.length
```

- `liveGraphBeads` and `buildEpicGraphScope` are **unchanged**.
- `considered` becomes the post-facet count, so the existing "N hidden by filter"
  hint stays accurate. Its tooltip text is updated to name both the live toggle and
  the search/assignee/labels filters.
- Edge case: filtering can remove the epic's children while the anchor epic
  remains; `epicLayout` handles an epic-only set fine (it is just a scoped node).

### Header UI

Add to the existing wrapping header, before/next to the Epic scope select:

- **Search** input — `data-search`, placeholder `Search beads…  (/)`, bound to
  `search`.
- **Assignee** `MultiSelectFilter` (options from `assigneeOptionsFrom`; render only
  when the options list is non-empty, matching `FilterBar`). Options include
  "Unassigned" when some beads lack an assignee.
- **Labels** `MultiSelectFilter` (options from `labelOptionsFrom`; render only when
  the options list is non-empty, matching `FilterBar`).
- **Clear · n** button, shown only when `search`, `assignees`, or `labels` is
  non-empty; resets all three. Mirrors `FilterBar`'s active-filter affordance.

Existing controls (Epic scope select, Spotlight, Live dependencies only, Center)
stay as-is. Changing epic scope keeps today's behaviour of clearing `focusId`;
filters are intentionally **not** reset when scope changes.

### Viewport re-fit

`ReactFlow`'s `key` currently includes the epic id and the live flag, which remounts
and `fitView`s on those changes. Filters don't change the key. Add a small effect
that calls the existing `center()` callback when a memoized signature of visible
node ids changes (debounce is unnecessary: `fitView` is cheap and the signature only
changes when the result set changes, not on every keystroke that matches the same
set). This keeps the canvas framed on matches.

### Empty state

The current overlay distinguishes only `liveOnly`. Replace the message/action logic:

- `considered === 0` → "There are no non-archived beads in this project." (unchanged)
- otherwise, if the visible set is empty, show the recovery actions that apply:
  - **Clear filters** when any of search / assignees / labels is active.
  - **Show all beads** (unchecks `liveOnly`) when `liveOnly` is on — the new default
    and the most common cause.
  - When both apply, show both buttons.

## Files touched

| File | Change |
|---|---|
| `components/graph-view.tsx` | default `liveOnly=true`; add search + assignee + labels state and header controls; apply `matchesFilters` in the pipeline; update hint tooltip, empty state, and viewport re-fit |
| `scripts/test-graph.mjs` | update default/pruning assertions; add search, assignee, labels coverage |

## Verification

- `npm run lint`, `npx tsc --noEmit`, `npm run build` pass.
- `scripts/test-graph.mjs` passes against an isolated server
  (`SCOTTY_TEST_URL=http://127.0.0.1:3000 node scripts/test-graph.mjs`) after the
  updates below:
  - Default assertion flips: default now shows `child, epic, linked-a, linked-b,
    nested` (closed `finished` and unlinked `new-a`/`new-b` hidden).
  - Drag-to-link step must first **uncheck** "Live dependencies only" so the
    unlinked `new-a`/`new-b` are visible.
  - Existing "empty filter / Show all beads" recovery test still passes (default is
    now the pruned state).
  - New: searching by id/title/label narrows the nodes; the Assignee dropdown
    filters to one assignee (and "Unassigned"); the Labels dropdown filters by
    exact label; unchecking the toggle reveals closed beads.
- Manual smoke test: open Graph → only live beads show; uncheck the toggle → closed
  beads reappear; type in search → canvas re-fits to matches; pick an assignee/label
  → graph narrows; Clear resets.

## Out of scope (YAGNI)

- URL/bookmark persistence of graph filters.
- Adding Status/Type/Priority/Origin facets to the graph.
- Changing Board/List filter behaviour or `lib/filters.ts`.
- Highlighting (dimming) non-matching nodes instead of filtering them out.
- Persisting the live toggle / filters across sessions.
