# Design export → app mapping

Source: `extracted/Bead Me Up Scotty.dc.html` (Claude Design `.dc` format — templated
HTML + an embedded `Component` class that is a full working prototype). The export
already implements the spec's behavior against a mock dataset; we port it to the
real stack and swap the mock for live `bd` data.

## Design tokens (→ `app/globals.css` CSS variables, both themes)
- Fonts: **Geist** (UI), **Geist Mono** (ids/commands/labels). Load via `next/font`.
- Light: `--bg #f6f6f8` `--surface #fff` `--surface-2 #f1f1f4` `--surface-3 #ebebef`
  `--border #e7e7ec` `--border-strong #d6d6dd` `--text #16161a` `--text-2 #62626d`
  `--text-3 #9a9aa5` `--accent #6d5ef0` `--accent-2 #5546e0` `--accent-weak #efedfd`.
- Dark (`[data-theme=dark]`): `--bg #0c0c0f` `--surface #161619` `--surface-2 #1d1d22`
  `--surface-3 #26262d` `--border #26262d` `--border-strong #34343d` `--text #f2f2f5`
  `--text-2 #a2a2ad` `--text-3 #6c6c77` `--accent #8b7cf8` `--accent-2 #9c8ffa`
  `--accent-weak #211d3a`.
- Shadows `--shadow`, `--shadow-lg`; keyframes `bdFade/bdDrawer/bdModal/bdToast/bdPop`.
- Map these onto shadcn's token names in `globals.css` so shadcn components inherit them.

## Semantic color logic (→ `lib/beads-view.ts`, ported verbatim from the prototype)
- `category(status)`: closed→done, in_progress|hooked→wip, blocked→blocked,
  deferred|pinned→frozen, else→active.
- `catColor`: done `#16a34a`, wip `#d97706`, blocked `#ef4444`, frozen `#64748b`,
  active `#3b82f6`.
- `prioColor[0..4]`: `#ef4444 #f97316 #eab308 #0ea5e9 #64748b`;
  `prioLabel`: Critical/High/Medium/Low/Backlog.
- `typeColor`: epic→accent, bug→`#ef4444`, else `--text-3`.
- `avatarColor(name)` hash → palette; `initials(name)`.
- `isBlocked(b)`: status==blocked, or open with a `blocks` dep whose target ≠ closed.
- `epicOf` / `childrenOf` via `parent-child` deps; epic pct = closed ÷ total.
- `origin(b)` = human if `created_by ∈ humanAllowlist` else agent (spec §6).
- Icons: inline SVG set in the prototype (`ICONS`) → reuse as React components
  (`components/icons.tsx`); type icons keyed by issue_type.

## Screen → spec → components
| Export screen | Spec § | Components | Data source |
|---|---|---|---|
| Sidebar (logo, nav, repo card, actor, theme) | §8 | `components/sidebar.tsx` | config + `bd doctor` |
| Board: toolbar (search/filters/archived/New) + 5 columns | §8.1, §7 | `board/*` (`Toolbar`, `Column`, `BeadCard`) | `bd list`/`ready`/`blocked` |
| Epics: progress bars + expandable children + add child | §8.2, §1.3 | `epics/*` | `bd list --type epic` + children |
| Dependency graph | §8.4, §1.4 | `graph/*` (React Flow) | `bd dep tree`/`list` |
| Settings: repo, attribution, freshness/theme | §8.6, §6, §9 | `settings/*` | `lib/config` |
| Detail drawer: status/prio/assignee/epic, desc, deps, comments, activity | §8.3 | `bead-detail-drawer.tsx` | `bd show <id>` |
| Create modal | §8.5 | `create-bead-modal.tsx` | `bd create` |
| Toast | cross | shadcn `sonner` | — |

## Behavior parity to preserve (from the prototype)
- 5 columns: **Backlog**=`deferred`, **Ready**=open & !blocked, **In Progress**=
  in_progress|hooked, **Blocked**=blocked (no drop target), **Done**=closed.
- DnD `moveCard`: →backlog sets `deferred`; →ready sets `open` (stays Blocked if
  still dep-blocked); →in_progress sets `in_progress`; →done = `bd close`.
- Cards: status dot, mono id, priority chip, origin badge, type, ≤2 labels
  (hide `archived`), assignee avatar, dep/comment counts, epic tag.
- Archived hidden by a standing filter; toggle to show. Archive = close + `archived`
  label. Delete = `bd delete` behind a confirm.
- Create stamps `created_by`/`BEADS_ACTOR`=human actor; "Start in Backlog" → `deferred`.
- Keyboard: `n` new, `/` focus search, `Esc` close.

## Port deltas (prototype → production)
- Replace mock `buildBeads()` with `bd … --json` via `lib/bd.ts`; keep the view-model
  shapes so components change little.
- Replace in-memory mutations with API routes + TanStack Query optimistic updates.
- Replace the hand-rolled SVG graph with React Flow (same node/edge semantics + legend).
- Inputs/selects/buttons → shadcn equivalents themed to the tokens above.
