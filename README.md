# Bead Me Up, Scotty

A local, single-user web UI for **[beads](https://github.com/gastownhall/beads)**
(`bd`) — Steve Yegge's distributed graph issue tracker. beads ships a powerful CLI
but no interactive visualizer that also lets you *create* work. This app is that
visualizer: a fast, graph-aware task board for humans, on top of a tracker built
for AI agents.

## Features

- **Board** — a five-column view (Backlog · Ready · In Progress · Blocked · Done)
  with dense cards showing id, type, priority, assignee, dep/comment counts, and an
  origin badge. Filter by type / priority / origin, full-text search, and a
  show/hide-archived toggle. Keyboard: `n` new, `/` search, `Esc` close.
- **Backlog ↔ Ready drag-and-drop** — drag cards between columns to change status
  (Backlog = `deferred`, Done = `bd close`); updates are optimistic.
- **Create / edit** — add tasks and epics (type, priority, description, assignee,
  labels, parent epic, start-in-backlog) and edit status/priority inline.
- **Epics & progress** — epics with live `closed ÷ children` progress bars and
  expandable child lists; add a child straight into an epic.
- **Dependencies & graph** — view/add/remove typed dependencies in the detail
  drawer, plus an interactive React Flow dependency graph (drag node→node to link).
- **Comments** — author-stamped comment threads with a composer on every bead.
- **Archive & delete** — archive (reversible `bd close` + `archived` label) or
  delete (`bd delete`, behind a confirm).
- **Human-vs-agent attribution** — every bead and comment shows 👤 (human) or 🤖
  (agent), derived from a configurable human allowlist.
- **Settings** — repo path, human actor + allowlist, poll interval, and light/dark
  theme. Live polling keeps the board fresh when agents change data underneath you.

## How it works

- **beads has no HTTP API**, so the app shells out to the `bd` CLI
  (`bd … --json`, `BD_JSON_ENVELOPE=1`). `bd` stays the single source of truth —
  the app adds **zero** new persisted schema. The only adapter is
  [`lib/bd.ts`](lib/bd.ts); see the spec in [`design/design.md`](design/design.md).
- The UI was designed in **Claude Design** and rebuilt faithfully here with
  Next.js + shadcn/Tailwind. The original export and a screen/token map live in
  [`design/ui-export/`](design/ui-export/).

### Backlog & attribution (design decisions)
- **Backlog** maps to beads' built-in `deferred` status; **Ready** = open &
  unblocked. Dragging between columns runs `bd update --status` / `bd close`.
- beads has no human-vs-agent flag, so the UI stamps its own writes with a
  configured **human actor** (`BEADS_ACTOR`); anyone in the human allowlist renders
  as 👤, everyone else as 🤖. **Archive** = `bd close` + an `archived` label
  (reversible); **Delete** = `bd delete`.

## Run it

**Prerequisites:** Node 20+ and npm. For live mode you also need the
[`bd`](https://github.com/gastownhall/beads) binary on your `PATH` and a `.beads`
repo (`bd init`). No `bd`? The app falls back to demo mode automatically.

```bash
npm install
npm run dev            # http://localhost:3000
```

- **With real data:** run from (or point Settings at) a directory containing a
  `.beads` repo, with `bd` on your `PATH`. Override the repo with
  `BEADS_REPO=/path/to/project` and the binary with `BD_BIN=/path/to/bd`.
- **Demo mode:** if `bd` isn't installed (or you set `BEADS_DEMO=1`), the app runs
  against an in-memory dataset seeded from the design export — so you can explore
  every feature without beads. The sidebar shows which mode is active.

Set the human actor / allowlist, repo path, and theme in **Settings** (stored
under your OS config dir, not in beads).

## Install globally

Install once from a clone, then run `scotty` (or `bead-me-up-scotty`) from **any**
directory. It starts the production server on a free port (default 3000) and opens
your browser. Run it from a folder that has a `.beads` repo to jump straight to
that project; otherwise you get the project picker. Requires Node 20+.

Flags: `-p, --port <n>` · `--no-open` · `--help`.

**Recommended — `npm link` (keep the clone):**

```bash
git clone <repo-url> bead-me-up-scotty
cd bead-me-up-scotty
npm install
npm run build
npm link
scotty                 # from anywhere
```

The global command is a symlink to the clone, so keep it on disk and re-run
`npm run build` after pulling changes. Uninstall: `npm rm -g bead-me-up-scotty`.

**Alternative — global copy (clone is deletable):**

```bash
git clone <repo-url> bead-me-up-scotty
cd bead-me-up-scotty
npm install
rm -rf .next           # ensure a clean build (only the prod build is shipped)
npm run build
npm install -g .
scotty                 # from anywhere; the clone can now be deleted
```

To update, rebuild and re-run `npm install -g .`. If `npm install -g .` hits a
permissions error, use a user-owned npm prefix:
`npm config set prefix ~/.npm-global` and add `~/.npm-global/bin` to your `PATH`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui ·
TanStack Query (polling + optimistic DnD) · dnd-kit (board) · @xyflow/react
(dependency graph) · Zod (validates `bd` output *and* forms).

## Project layout

```
app/                  # pages + API route handlers (the only server entry points)
  api/beads/**        # GET list, POST create, [id] PATCH/DELETE, status, comments, deps, archive
  api/doctor, config  # bd preflight + local config
lib/
  bd.ts               # the ONLY bd CLI bridge (execFile, JSON envelope, write mutex)
  demo-store.ts       # in-memory fallback seeded from the export
  store.ts            # picks bd vs demo
  schema.ts           # Zod schemas + types (bd data model)
  beads-view.ts       # pure view-model helpers (status/priority colors, blocked, epic progress)
  attribution.ts      # human-vs-agent origin
components/           # sidebar, board (dnd), detail drawer, create modal, epics, graph, settings
```

## Verify

```bash
npm run build         # typecheck + production build
npm run lint          # eslint
```
