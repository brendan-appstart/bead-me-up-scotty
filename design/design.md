
==== specification starts here ====

# Bead Me Up, Scotty — Specification

A local, single-user web UI for **beads** (`bd`), Steve Yegge's distributed graph
issue tracker (https://github.com/gastownhall/beads). beads ships a powerful CLI
but no interactive visualizer that also lets you *create* work. This app fills
that gap: a fast, graph-aware task board for humans, sitting on top of an issue
tracker designed for AI agents.

> Decisions locked in with the project owner (2026-06-16):
> 1. **Integration:** the UI shells out to the `bd` CLI (`bd … --json`). beads has
>    no HTTP API; the CLI is the source of truth for all invariants (ID hashing,
>    ready-queue logic, audit trail, Dolt commits).
> 2. **Deployment:** local single-user tool. Runs on `localhost` against the user's
>    own `.beads` repo. No auth, no multi-tenancy in v1.
> 3. **Human-vs-agent attribution:** the UI tags its own writes with a known actor
>    so they can be distinguished from agent-created beads (see §6).
> 4. **Backlog model:** the "Backlog" column maps to beads' built-in `deferred`
>    status; "Ready" maps to open & unblocked beads (see §7).

---

## 1. Background: how beads actually works

This section is the ground truth the rest of the spec builds on. It was verified
directly against the beads source (`internal/types/types.go`, `cmd/bd/*.go`,
`docs/JSON_SCHEMA.md`, `docs/DOLT.md`, `docs/DEPENDENCIES.md`).

### 1.1 Storage & runtime model
- beads is a single Go binary (`bd`). Its store is **Dolt**, a version-controlled
  SQL database. Two backend modes:
  - **Embedded** (default): single-writer, in-process, data in `.beads/`. No server,
    no ports. This is what a local single user has.
  - **Server**: a `dolt sql-server` (MySQL wire protocol, default port `3307`) for
    multi-writer/agent use.
- **There is no native HTTP/REST API.** Integration paths are: (a) shell out to the
  `bd` CLI with `--json`, (b) talk MySQL to a Dolt server in server mode, or
  (c) read the `issues.jsonl` export (read-only). **We use (a).**

### 1.2 The Issue (bead) data model
A bead is one row with (selected fields — full list in §4.1):

| Field | Type | Notes |
|---|---|---|
| `id` | string | hash-based, e.g. `bd-a3f8`; hierarchical children like `bd-a3f8.1` |
| `title` | string | required, ≤500 chars |
| `description` | string | optional |
| `status` | enum | see below |
| `priority` | int `0`–`4` | `0`=critical … `4`=backlog |
| `issue_type` | enum | see below |
| `assignee` | string | optional |
| `owner` | string | human owner (git author email) |
| `created_by` | string | free-text actor name — **our attribution hook** |
| `created_at`/`updated_at`/`started_at`/`closed_at` | RFC3339 | |
| `labels` | string[] | populated on show/export |
| `dependencies` | object[] | typed edges (§1.4) |
| `comments` | object[] | `{id, issue_id, author, text, created_at}` |
| `dependency_count`/`dependent_count`/`comment_count` | int | computed |
| `parent` | string\|null | computed from a `parent-child` dependency |

**`status` enum:** `open`, `in_progress`, `blocked`, `deferred`, `closed`,
`pinned`, `hooked`. (Status categories: active / wip / done / frozen.)

**`issue_type` enum:** `bug`, `feature`, `task`, `epic`, `chore`, `decision`,
`message`, `spike`, `story`, `milestone` (+ internal: `molecule`, `gate`, `event`).
v1 surfaces the human-facing subset (§4.2).

**`priority`:** integer `0`–`4`. beads literally labels `4` as "backlog".

### 1.3 Epics & hierarchy
- An epic is **not** a separate entity — it is a regular bead with
  `issue_type = "epic"`. Children attach via a `parent-child` dependency (or the
  `--parent` flag at create time, which also yields hierarchical IDs).
- **Epic progress** is computed from children's statuses (closed children ÷ total
  children). beads exposes this via `bd epic` subcommands; we also compute it
  client-side from the child set for live rendering.

### 1.4 Dependencies
Dependencies are **typed directed edges** `(issue_id) depends-on (depends_on_id)`.
Types that **block** the ready queue: `blocks`, `parent-child`,
`conditional-blocks`, `waits-for`. Non-blocking/association types include
`related`, `relates-to`, `discovered-from`, `duplicates`, `supersedes`,
`caused-by`, `validates`, `tracks`. v1 exposes `blocks`, `parent-child`, and
`related`/`relates-to` in the UI; the rest are displayed read-only if present.

### 1.5 Ready vs blocked vs backlog
- `bd ready` → beads that are `open`, have **all blocking deps closed**, and are not
  deferred. This is the actionable work queue.
- `bd blocked` → `open` beads still waiting on blocking deps.
- **There is no first-class "backlog."** Per the owner's decision we map Backlog →
  `deferred` status (beads' built-in "deliberately on ice for later"). See §7.

### 1.6 Attribution reality
There is **no boolean** distinguishing human- from agent-created beads. The only
signal is the free-text `created_by` / `owner` / `--actor`. The UI therefore
*stamps its own writes* with a recognizable actor (§6).

### 1.7 The CLI command surface we rely on (verified)
`bd create`, `bd update`, `bd close`, `bd delete <id…>`, `bd show <id>`,
`bd list`, `bd ready`, `bd blocked`, `bd dep add|remove|list|tree|cycles`,
`bd comment` / `bd comments`, `bd label`, `bd assign`. All support `--json`.
There is **no `bd archive`** — archive is modeled in §5.7.

---

## 2. Goals & non-goals

**Goals (v1)**
- A polished, fast local board for viewing and managing beads.
- Cover every feature in the original brief: list tasks & statuses; list epics &
  progress; add/edit task & epic; comment; archive; delete; human/agent icon;
  view/add/update dependencies; Backlog↔Ready with drag-and-drop.
- Treat `bd` as the single source of truth — **never** write Dolt directly. "Utilize
  built-in data structures as much as possible" → we mirror beads' own model and
  add **zero** new persisted schema; the only app-side state is lightweight UI
  preference/config.

**Non-goals (v1)**
- Auth, multi-user, multi-tenant hosting.
- Editing internal bead types (molecule/gate/event) or the federation/messaging
  subsystems.
- A hosted SaaS deployment. (Architecture leaves the door open — see §11.)

---

## 3. Tech stack (decided)

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router, TypeScript), Node runtime** | One process serves UI + server-side route handlers that spawn `bd`. Trivial `npm run dev` local start. |
| Runtime | **Node 20+** | `child_process` to invoke `bd`; must run on the host where `bd` + `.beads` live. |
| UI components | **shadcn/ui + Tailwind CSS** | High-quality, composable primitives; fast to build a dense board. |
| Server state | **TanStack Query** | Caching, background refetch/polling, optimistic updates for snappy DnD. |
| Drag & drop | **dnd-kit** | Accessible, headless DnD for Backlog↔Ready and status columns. |
| Dependency graph | **@xyflow/react (React Flow)** | Interactive node/edge graph; pan/zoom; add-edge by dragging. |
| Validation | **Zod** | Validate `bd` JSON output *and* form input against one schema set. |
| CLI bridge | Node `child_process.execFile` | Spawn `bd` with `BD_JSON_ENVELOPE=1`; no shell string interpolation. |
| Tests | **Vitest** (unit) + **Playwright** (e2e) | Unit-test the bd adapter against a temp `.beads` repo; e2e the flows. |

No database, ORM, or external service. App config (selected `.beads` repo path,
the configured human actor name, poll interval) lives in a small JSON file under
the OS config dir.

> Why not direct Dolt SQL? It would force us to re-implement bd's ID hashing,
> ready-queue rules, epic math, and audit/commit semantics, and risk drift on every
> beads release. Shelling out keeps us correct by construction. A future read-path
> optimization (Hybrid: SQL reads, CLI writes) is noted in §11 if perf demands it.

---

## 4. Domain model in the app

### 4.1 Canonical TypeScript types
Mirror beads exactly; add **no** new persisted fields. A single Zod schema parses
`bd … --json` (envelope mode) and is reused for forms.

```ts
type BeadStatus = "open" | "in_progress" | "blocked" | "deferred"
                | "closed" | "pinned" | "hooked";
type BeadType   = "bug" | "feature" | "task" | "epic" | "chore"
                | "decision" | "spike" | "story" | "milestone";
type DepType    = "blocks" | "parent-child" | "conditional-blocks" | "waits-for"
                | "related" | "relates-to" | "discovered-from" | "duplicates"
                | "supersedes" | "caused-by" | "validates" | "tracks";

interface Dependency { issue_id: string; depends_on_id: string; type: DepType;
                       created_by?: string; created_at?: string; }
interface Comment    { id: string; issue_id: string; author: string;
                       text: string; created_at: string; }

interface Bead {
  id: string; title: string; description?: string;
  status: BeadStatus; priority: 0|1|2|3|4; issue_type: BeadType;
  assignee?: string; owner?: string; created_by?: string;
  created_at: string; updated_at?: string; started_at?: string; closed_at?: string;
  labels?: string[]; dependencies?: Dependency[]; comments?: Comment[];
  dependency_count?: number; dependent_count?: number; comment_count?: number;
  parent?: string | null;
  // derived (app-computed, not persisted):
  origin?: "human" | "agent";        // §6
  epicProgress?: { closed: number; total: number };  // §1.3, epics only
}
```

### 4.2 Display vocabulary (UI labels for raw enum values)
- Priority: `0` Critical · `1` High · `2` Medium · `3` Low · `4` Backlog.
- Status badges colored by category: active (open) · wip (in_progress, hooked) ·
  blocked · frozen (deferred, pinned) · done (closed).
- Type icons: bug 🐞, feature ✨, task ☑️, epic 🎯, chore 🧹, decision ⚖️,
  spike 🔬, story 📖, milestone 🚩 (final glyphs chosen in design pass).

---

## 5. The bd adapter (server-side bridge)

A single module `lib/bd.ts` is the **only** thing that touches `bd`. Every other
server module goes through it. All UI mutations are server-side route handlers
(`app/api/*`) that call this adapter — `bd` never runs in the browser.

### 5.1 Invocation contract
- `execFile("bd", args, { cwd: repoPath, env: { ...process.env,
  BD_JSON_ENVELOPE: "1", BEADS_ACTOR: humanActor } })`. Args passed as an **array**
  (no shell), so titles/descriptions are injection-safe.
- Always request envelope JSON; parse `{ schema_version, data }`; validate `data`
  with Zod; log & surface a typed error if `schema_version` is unexpected.
- Errors: `bd` writes a JSON error object to stderr with a `code` (e.g.
  `not_found`); the adapter maps these to typed `BdError`s → HTTP 4xx/5xx.
- Concurrency: embedded mode is single-writer. The adapter **serializes writes**
  through an in-process queue/mutex so concurrent UI actions can't collide on the
  Dolt writer; reads may run in parallel.

### 5.2 Command map (UI action → bd invocation)

| UI action | bd command |
|---|---|
| List board | `bd list --json` (+ `--status/--type/--priority/--label` filters) |
| Ready queue | `bd ready --json` |
| Blocked | `bd blocked --json` |
| Open detail | `bd show <id> --json` (includes deps + comments) |
| Create | `bd create "<title>" --type <t> --priority <n> [--description … --assignee … --labels … --parent <epicId>] --json` |
| Edit | `bd update <id> [--title … --description … --priority … --status … --assignee … --type …] --json` |
| Change status (DnD) | `bd update <id> --status <s>` (or `bd close <id>`; see §7) |
| Comment | `bd comment <id> "<text>"` |
| Add dependency | `bd dep add <id> <dependsOnId> --type <t>` |
| Remove dependency | `bd dep remove <id> <dependsOnId>` |
| Dep tree/graph | `bd dep tree <id> --json` + `bd dep list <id> --json` |
| Add to epic | `bd dep add <childId> <epicId> --type parent-child` (or `--parent` on create) |
| Archive | `bd close <id>` + `bd label add <id> archived` (§5.7) |
| Delete | `bd delete <id>` (confirmed dialog) |

### 5.3–5.6 (create/edit/comment/dependency specifics)
- **Create** stamps attribution (§6) and, when created inside an epic, passes
  `--parent`. Returns the new bead; client invalidates the relevant queries.
- **Edit** sends only changed fields. Status changes route through §7's mapping.
- **Comments** are author-stamped with the human actor; the detail panel renders
  the comment thread newest-last with author + relative time.
- **Dependencies**: adding an edge calls `bd dep add`; before committing a
  `blocks`/`parent-child` edge the UI calls `bd dep cycles` (or validates the edge
  server-side) and refuses cycles with a clear message.

### 5.7 Archive (no native bd command)
beads has no archive status. Archive = **`bd close <id>` + add label `archived`**.
This is reversible (un-archive = remove label and/or reopen), keeps the audit
trail intact, and hides the bead from default board views via a standing
"exclude `archived`" filter. An "Archived" view lists them. (If the owner later
prefers, this can switch to a pure-label soft-archive without closing.)

---

## 6. Human vs agent attribution (decided: UI tags its own writes)

- The app has a single configured **human actor** name (default derived from
  `git config user.name`/email, editable in Settings).
- Every UI write runs with `BEADS_ACTOR=<humanActor>` (and the same value lands in
  `created_by`/comment `author`). The app records this marker as the "this is the
  human/UI" signal.
- **Origin derivation:** a bead's `origin` is `"human"` if its `created_by` equals
  the configured human actor (or matches an optional allowlist of known human
  names); otherwise `"agent"`. Comments get the same treatment per-author.
- **UI:** a small badge on every bead card and comment — e.g. 👤 for human/UI,
  🤖 for agent — with a tooltip showing the raw `created_by`. The allowlist is
  editable in Settings so pre-existing data created by teammates can be marked
  human too.

---

## 7. Backlog ↔ Ready (decided: Backlog = `deferred`)

The board's two flow columns:
- **Ready** = result of `bd ready` (open, unblocked, not deferred).
- **Backlog** = beads with `status = "deferred"`.
- **Blocked** (third, read-mostly column) = `bd blocked` (open but dep-blocked) —
  shown so users understand why something isn't Ready; you can't drag *into* it.

**Drag semantics**
- Backlog → Ready: `bd update <id> --status open` (de-defer). If still blocked by
  deps it lands in Blocked instead, with a toast explaining why.
- Ready/Open → Backlog: `bd update <id> --status deferred`.
- A fuller **Kanban view** (§8) additionally exposes `open → in_progress → closed`
  via columns, using `bd update --status` / `bd close`.
- All DnD is **optimistic** (TanStack Query) with rollback on adapter error.

---

## 8. Screens & UX

1. **Board (home).** Columns: Backlog · Ready · In Progress · Blocked · Done.
   Cards show id, title, type icon, priority chip, assignee, origin badge (§6),
   dep/comment counts. Drag between columns per §7. Top bar: filters (status,
   type, priority, label, assignee, text search), "exclude archived" default-on,
   and a "+ New" button. Powered by `bd list`/`bd ready`/`bd blocked`.
2. **Epics view.** Each epic as a card/row with a **progress bar** (closed ÷ total
   children) and expandable child list; "+ Add child" creates a bead with
   `--parent`. Progress computed from the child set (§1.3).
3. **Bead detail (drawer/route `/bead/[id]`).** Full fields, inline edit, status
   control, labels, assignee; **Dependencies** panel (list + add/remove, grouped by
   type, blocking ones flagged); **Comments** thread with composer; **Activity**
   (created/updated/closed timestamps + origin); Archive & Delete actions.
4. **Dependency graph (`/graph`).** React Flow rendering of beads as nodes, typed
   edges; color blocking vs non-blocking; click a node → detail; drag node→node to
   create a dependency (type picker on drop, cycle-checked). Scope to an epic or a
   selected bead's neighborhood for large graphs.
5. **Create/Edit modal.** Type, title, description, priority, assignee, labels,
   parent epic, initial dependencies (`--deps`). Zod-validated.
6. **Settings.** `.beads` repo path, human actor name + human-allowlist, poll
   interval, theme.

**Cross-cutting UX:** keyboard-first (n=new, /=search, j/k navigate, e=edit),
optimistic updates, toasts on success/error, empty/loading/error states,
responsive but desktop-first, light/dark.

---

## 9. Data freshness
Agents may change the repo underneath us. v1: **TanStack Query polling** (default
~5 s, configurable; pause when tab hidden) plus refetch-on-window-focus and
immediate invalidation after our own mutations. (A future optimization can watch
`.beads/` for changes and push via SSE — see §11.)

---

## 10. Project structure (Next.js App Router)

```
app/
  page.tsx                 # Board
  epics/page.tsx
  graph/page.tsx
  bead/[id]/page.tsx
  settings/page.tsx
  api/beads/route.ts       # GET list/ready/blocked, POST create
  api/beads/[id]/route.ts  # GET show, PATCH update, DELETE
  api/beads/[id]/comments/route.ts
  api/beads/[id]/deps/route.ts
  api/beads/[id]/archive/route.ts
lib/
  bd.ts                    # the ONLY bd bridge (§5)
  schema.ts                # Zod schemas + TS types (§4)
  attribution.ts           # origin derivation (§6)
  config.ts                # app config (repo path, actor, allowlist)
components/                # board, cards, detail drawer, graph, forms (shadcn)
```

---

## 11. Risks, edge cases, future work
- **bd not installed / wrong version / not a beads repo** → Settings runs
  `bd doctor`/`bd --version` and shows actionable setup guidance; pin a tested
  beads version range and warn on `schema_version` mismatch.
- **Embedded single-writer contention** → serialized write queue (§5.1); surface
  busy/retry on transient lock errors.
- **`--json` flag drift across bd releases** → centralized adapter + Zod parsing +
  contract tests against a temp repo catch breakage in one place.
- **Large graphs** → scope/virtualize React Flow; lazy-load neighborhoods.
- **Attribution false-negatives** (humans using other tools) → mitigated by the
  editable human-allowlist (§6).
- **Future:** Hybrid read path (Dolt SQL reads + CLI writes) if polling/`bd list`
  latency becomes a bottleneck; SSE file-watch for push freshness; optional
  server-mode + auth to graduate from single-user to small-team (the bd adapter
  abstraction makes this a swap, not a rewrite).

---

## 12. Milestones
1. **M0 — Adapter & schema.** `lib/bd.ts`, Zod schemas, config, `bd doctor` check;
   list/show working read-only. Vitest against a temp `.beads`.
2. **M1 — Board read.** Board with columns/filters/search from
   list/ready/blocked; origin badges; detail drawer (read-only).
3. **M2 — Write basics.** Create/edit/close/delete; comments; attribution stamping;
   optimistic updates + toasts.
4. **M3 — Flow & epics.** Backlog↔Ready DnD (§7), Kanban statuses, epics view with
   progress, archive.
5. **M4 — Dependencies & graph.** Dep panel add/remove with cycle checks; React
   Flow graph with drag-to-link.
6. **M5 — Polish.** Keyboard nav, settings, theming, Playwright e2e, docs/README.

==== creator notes: ====

We are creating a web Which will allow users to view tasks for steve yegges beads. That project is found here: https://github.com/gastownhall/beads . It has no good interactive visualizer currently which also allows users to add tasks. 

We would like the following features: 
Task management. 
List tasks and their statuses. 
List epics and their progress. 
Add a task. 
Add an epic. 
Edit/Update a task or epic. 
Add comments to a task or epic. 
Archive a task or epic. 
Delete a task or epic. 
Display an icon whether a task or epic has been added by a user using this interface or by an agent. 
Show dependencies. 
Add and update dependencies. 
Have a backlog versus tasks that are ready to be worked on and make it easy to drag tasks between the two or to mark them. 
Utilize built-in data structures as much as possible as opposed to creating new ones.
