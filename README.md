<div align="center">

<h1>🛸 Bead Me Up, Scotty</h1>

<p>
  <b>The free, open-source visual UI for <a href="https://github.com/gastownhall/beads">Beads</a></b> — Steve Yegge's
  graph-based issue tracker for AI coding agents.<br/>
  <i>Brainstorm, create, and organize work in the same place your AI agent does.</i>
</p>

<table>
  <tr>
    <td>
      <p><strong>✨ A rich, interactive workspace for Beads</strong></p>
      <p><strong>Create beads, edit their details, drag them between columns, and change their status directly in the UI.</strong> Organize subtasks, connect dependencies, and steer the work alongside your AI agents — with changes written back to Beads.</p>
      <p>This is why Scotty was built: to give humans a visual way to <strong>work with beads</strong>, beyond simply viewing them.</p>
    </td>
  </tr>
</table>

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-6d5ef0?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js&logoColor=white" alt="Next.js 16">
  <img src="https://img.shields.io/badge/Run_anywhere-scotty-22c55e?style=flat-square" alt="Global CLI: scotty">
  <a href="https://github.com/brendan-appstart/bead-me-up-scotty/stargazers"><img src="https://img.shields.io/github/stars/brendan-appstart/bead-me-up-scotty?style=flat-square&color=eab308" alt="GitHub stars"></a>
</p>

<a href="https://youtu.be/0zpg_FRX-wE" title="Watch the 2-minute demo">
  <img src=".github/screens/board.png" alt="Bead Me Up, Scotty — click to watch the demo" width="860">
</a>

<p><b>▶️ <a href="https://youtu.be/0zpg_FRX-wE">Watch the 2-minute demo</a></b></p>

<p>
  <a href="https://beadmeupscotty.com"><b>🌐 Website</b></a> ·
  <a href="https://youtu.be/0zpg_FRX-wE"><b>▶️ Demo video</b></a> ·
  <a href="https://github.com/brendan-appstart/bead-me-up-scotty"><b>⭐ Star the repo</b></a> ·
  <a href="https://github.com/gastownhall/beads"><b>🧵 Beads</b></a>
</p>

<table>
  <tr>
    <td width="50%" align="center"><img src=".github/screens/detail.png" alt="Detail drawer with inline editing"><br/><sub><b>Detail drawer — inline edit, deps & comments</b></sub></td>
    <td width="50%" align="center"><img src=".github/screens/graph.png" alt="Interactive dependency graph"><br/><sub><b>Live dependency graph</b></sub></td>
  </tr>
</table>

</div>

---

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
- **Bead links** — open a bead directly with `/p/<project>?bead=<id>`. The address
  bar follows the open drawer; its **Copy link** button copies a shareable link,
  including in read-only mode. Drawer navigation keeps its own Back trail.
- **Archive & delete** — archive (reversible `bd close` + `archived` label) or
  delete (`bd delete`, behind a confirm).
- **Human-vs-agent attribution** — every bead and comment shows 👤 (human) or 🤖
  (agent), derived from a configurable human allowlist.
- **Settings** — repo path, human actor + allowlist, poll interval, and light/dark
  theme. Live polling keeps the board fresh when agents change data underneath you.

### Focus: compare assignees and recent completions

Open **Focus** in the project sidebar. It starts with the existing ungrouped
**In flight**, **Blocked**, and **Next up** columns. In flight includes work
marked `in_progress` or `hooked`; Next up remains ready P0/P1 work.

Choose **Group by → Assignee** in the Focus header to compare each assignee's
work across those columns. Work without an assignee has its own **No assignee**
row. Choose **None** to return to the original layout.

Turn on **Recently finished** to add the latest seven matching completions,
ordered by completion time. The count shows how many are displayed out of the
full matching set; **Show all … completed** expands it, and **Show latest 7**
restores the summary. Existing label-lane filters apply before this limit.
Active and blocked work is never capped, and archived beads stay excluded.

These are temporary display controls for the current Focus visit. They don't
change bead data or the project landing-view preference. Keyboard navigation,
detail links, and read-only protections also work in the grouped layout.

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

## Releases and updates

[Latest stable release](https://github.com/brendan-appstart/bead-me-up-scotty/releases/latest)
contains version-specific installation instructions, changes, and screenshots.
The sidebar displays the running app version.

In **Settings → Software updates**, choose **Stable releases** (the default) or
**Development (main)**. Stable checks published GitHub releases for all installation
types. Development checks the latest main commit and requires a Git checkout.
Checks run on load and every five minutes; disabling them takes effect immediately.
These GitHub requests are independent of the optional usage-statistics setting.

When a new version is available, click the sidebar notice to read its release notes.
A clean main/detached Git checkout can install the exact advertised target with
**Update now**. Dependencies are restored with `npm ci` and the app is rebuilt.
The supervised `npm run serve` launcher restarts automatically; other launchers
need a manual restart. Local changes or diverged history must be resolved first.
Global copies, source downloads, and Docker installations receive the notice with
manual update instructions. No update is installed automatically.

See [v0.2.0 release notes](docs/releases/v0.2.0.md) for the first versioned release.

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

### Focus view

**Focus** is an optional view for current work: In flight, Blocked, and Next up
(open, unblocked P0/P1 work). Board is the default whenever you open or reload a
project. Enable **Use Focus as the default view** in Settings to start in Focus instead. This toggle is off
by default and saves automatically for all projects in the current browser.
Lower-priority backlog and completed work remain
available in Board and List.

Set `SCOTTY_LANE_PREFIX=ctx:` to enable lane filters from labels such as
`ctx:frontend`. Without a prefix, lane filters are hidden. If a selected lane
vanishes during a live refresh, Focus shows all lanes again.

### Read-only viewing

Enable **Read-only mode** in Settings to monitor progress without editing beads.
The slim **Read Only Mode** banner stays above the project workspace. Click it
to keep or disable the mode, choose a small or large banner, or pick its background
and text colors. Appearance changes are saved automatically in this browser.

The mode applies to the current browser session, including its other tabs. A
session cookie preserves it through reloads; browser session restoration may
also restore that cookie. Other browser sessions are unaffected. Settings lets
you enable it again after dismissing the banner.

Set `SCOTTY_READ_ONLY=1` (or `true`) when launching Scotty to make read-only the
default for new browser sessions. A browser can explicitly override that default
from the banner. This is a local viewing preference, not a permissions system.
Project write requests are rejected by the server while the requesting browser
is read-only; application settings remain available.

### Docker

```bash
docker build -t bead-me-up-scotty .
docker run -p 3000:3000 bead-me-up-scotty      # → http://localhost:3000
```

> The build runs `npm ci`, which needs the committed `package-lock.json` for
> reproducible installs. The lockfile is tracked in the repo (a `.gitignore`
> negation keeps it that way even if your global gitignore excludes lockfiles),
> so a clean clone builds without a prior `npm install`.

The image includes the `bd` CLI, so real data works out of the box — just
mount your project directory and point `BEADS_REPO` at it:

```bash
BEADS_REPO=/path/to/project
docker run -d -p 3000:3000 \
  --name beads_ui \
  -v $BEADS_REPO:/data \
  -e BEADS_REPO=/data \
  bead-me-up-scotty
```

The container runs as a non-root `nextjs` user with `HOME=/home/nextjs` and
`XDG_CONFIG_HOME=/home/nextjs/.config`, so `bd` and app settings have a valid
runtime config directory. On Linux, if `bd` fails with permission errors writing
to the mounted `.beads` directory, run as your host user: `--user $(id -u):$(id -g)`
(the config dirs are world-writable, so settings keep working). Settings live
inside the container, so they are lost when it is recreated — bind-mount the
config dir to keep them:

```bash
-v "$HOME/.config/bead-me-up-scotty:/home/nextjs/.config/bead-me-up-scotty"
```

Container limitations:

- The image has no `git`, so Dolt remote sync (`refs/dolt/data`) and `bd init`
  don't work inside it — run those on the host. UI edits (create/update/close)
  work fine; they just won't auto-push until you sync from the host.
- **Refine with AI** shells out to the Claude Code CLI, which isn't bundled;
  the button shows an error in the container.
- The bundled `bd` version is pinned in the Dockerfile (`ARG BD_VERSION`);
  override with `--build-arg BD_VERSION=<version>` to match your host.

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

## License

[MIT](LICENSE) © Brendan

### Basic usage statistics

When `POSTHOG_KEY` (the PostHog **project token**, not a personal API key) is set
on the app server, Scotty reports `app_active` at most once per UTC day while the
UI is used. Set `POSTHOG_HOST=https://us.i.posthog.com` for US Cloud (the default).
These are runtime environment settings; Next.js also loads them from a local
`.env`. Do not commit `.env`. Fresh clones/global installs/Docker deployments need
these settings supplied separately; GitHub repository secrets are not
implicitly available to a running installation.

**Settings → Usage statistics → Share basic usage statistics** is enabled by
default. Switching it off stops future events across all projects and browsers
connected to that local server. It does not delete previously received events.
The preference lives in
`$XDG_CONFIG_HOME/bead-me-up-scotty/telemetry.json` (default:
`~/.config/bead-me-up-scotty/telemetry.json`), outside the Beads database.
The random ID is stored alongside it in `telemetry.json.id`; empty daily
reservation files live in `telemetry.json.days/`. They prevent duplicate events
across server processes without a lock that could remain stuck after a crash.

The only event data is the random ID, app version, timestamp, and PostHog flags
that disable person profiles and GeoIP enrichment. No browser analytics SDK is
loaded; no automatic page/click capture or session recording is enabled. Bead
content, project names/paths, user names, emails, URLs, and browser headers are
never included. PostHog still receives a network connection from the app server.
An idle server/background tab sends nothing. Failures time out after three
seconds, never affect app operations, and are not retried/backfilled that day.
If the preference cannot be read or the daily reservation cannot be saved,
reporting stops.

In PostHog, create a Product Analytics trend for `app_active`, choose **Unique
users**, and use daily, weekly, or monthly intervals. This measures approximate
active **installations**, not people: multiple machines count separately, shared
servers count once, and offline or opted-out installations are absent. Deleting the preference file restores the default setting; deleting the ID file
resets the installation identity.

Verify the capture and privacy rules with `node scripts/test-telemetry.mjs`
(Node 22.18+ for native TypeScript support). The tests use temporary local storage
and a fake network transport; they do not send production events.

For the Settings browser checks, start an isolated server with
`XDG_CONFIG_HOME=/tmp/scotty-usage-test POSTHOG_KEY='' BEADS_DEMO=1 SCOTTY_READ_ONLY=1 npm run start -- --port 3197`,
then run `SCOTTY_TEST_URL=http://localhost:3197 node scripts/test-telemetry-ui.mjs`.
The test refuses to run against an installation configured to send events.

## A small usage signal, and a thank you

When PostHog reporting is configured, Scotty sends a small signal that the app
was used, at most once a day. It helps us get a rough sense of how many
installations are active and whether people keep coming back.

The event includes a randomly generated installation ID, the app version, and
a timestamp. The ID lets us recognize the same installation on another day;
it isn't your name, email, or account. We don't send your beads, project names,
file paths, or anything you type, and we don't record your sessions or clicks.
Person profiles and location enrichment are disabled. PostHog still receives
the network connection, so we don't promise “100% anonymity.”

**You can turn it off at any time in Settings → Usage statistics → Share basic
usage statistics.** That stops future events, and your choice stays saved across
restarts. The app works just as well with reporting disabled.

Feel free to disable it. But knowing that people are using the app helps my
team and me decide where to focus our time, and encourages us to keep adding
updates and making it better. I truly appreciate everyone who shares feedback,
including through this small usage signal. Seeing that something we've built
is useful to you is inspiring. Thank you for being part of it.
