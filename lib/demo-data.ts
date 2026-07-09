import type { Bead, Comment, Dependency } from "./schema";

/**
 * Demo dataset for Bead Me Up, Scotty.
 *
 * This is the data source for demo mode (when bd isn't installed, or when demo
 * mode is forced via the BEADS_DEMO env var / the Settings toggle). It's a
 * realistic, well-rounded set: epics with children, mixed statuses / priorities
 * / types, human and agent authors, blocking + related dependencies, comments,
 * and an archived item. Edit this file to change what demo mode shows.
 */

interface Extra {
  description?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  labels?: string[];
  comments?: Comment[];
  blocks?: string[];
  related?: string[];
}

function D(
  id: string,
  title: string,
  issue_type: string,
  status: string,
  priority: number,
  created_by: string,
  assignee: string,
  parent: string | null,
  extra: Extra = {},
): Bead {
  const dependencies: Dependency[] = [];
  if (parent) dependencies.push({ issue_id: id, depends_on_id: parent, type: "parent-child" });
  (extra.blocks ?? []).forEach((t) => dependencies.push({ issue_id: id, depends_on_id: t, type: "blocks" }));
  (extra.related ?? []).forEach((t) => dependencies.push({ issue_id: id, depends_on_id: t, type: "related" }));
  return {
    id,
    title,
    issue_type,
    status,
    priority,
    assignee: assignee || "",
    created_by,
    description: extra.description ?? "",
    notes: extra.notes ?? "",
    created_at: extra.created_at ?? "2026-06-09T10:00:00Z",
    updated_at: extra.updated_at ?? "2026-06-14T15:00:00Z",
    closed_at: status === "closed" ? extra.closed_at ?? "2026-06-15T11:00:00Z" : null,
    labels: extra.labels ?? [],
    dependencies,
    comments: extra.comments ?? [],
    parent: parent ?? null,
  };
}

const cm = (author: string, text: string, created_at: string): Comment => ({ author, text, created_at });

/** The seed beads. Returns fresh copies so the in-memory store can mutate safely. */
export function demoBeads(): Bead[] {
  return [
    // epics (milestones M0–M5)
    D("bd-9f2a", "Adapter & schema (M0)", "epic", "in_progress", 1, "stevey", "stevey", null, { description: "The bd bridge, Zod schemas, config, and a doctor preflight. Everything else builds on this.", created_at: "2026-06-02T09:00:00Z" }),
    D("bd-3c71", "Board read (M1)", "epic", "open", 1, "stevey", "stevey", null, { description: "Read-only board: columns, filters, search, origin badges and a detail drawer. Powered by bd list/ready/blocked." }),
    D("bd-7e40", "Write basics (M2)", "epic", "open", 2, "stevey", "dana", null, { description: "Create/edit/close/delete, comments, attribution stamping, optimistic updates + toasts." }),
    D("bd-b18d", "Flow & epics (M3)", "epic", "deferred", 2, "stevey", "", null, { description: "Backlog↔Ready DnD, Kanban statuses, epics with progress, archive." }),
    D("bd-c552", "Dependencies & graph (M4)", "epic", "deferred", 3, "claude-agent", "", null, { description: "Dep panel add/remove with cycle checks; React Flow graph with drag-to-link." }),
    D("bd-1a09", "Polish & ship (M5)", "epic", "deferred", 3, "stevey", "", null, { description: "Keyboard nav, settings, theming, Playwright e2e, docs." }),
    // M0 children
    D("bd-9f2a.1", "bd adapter: execFile + JSON envelope", "task", "closed", 0, "claude-agent", "claude-agent", "bd-9f2a", { description: "Spawn bd with BD_JSON_ENVELOPE=1, args as an array, parse {schema_version,data}.", comments: [cm("stevey", "Confirmed args-as-array kills the injection risk. Nice.", "2026-06-05T12:00:00Z")] }),
    D("bd-9f2a.2", "Zod schemas for Bead / Dependency / Comment", "task", "closed", 1, "stevey", "stevey", "bd-9f2a", { description: "One schema set parses bd --json output and validates form input." }),
    D("bd-9f2a.3", "Config module (repo path, actor, allowlist)", "task", "in_progress", 2, "stevey", "stevey", "bd-9f2a", { description: "Small JSON config under the OS config dir. No new persisted bead schema.", comments: [cm("dana", "Can we derive the default actor from git config user.email?", "2026-06-14T09:30:00Z"), cm("stevey", "Yep, falling back to whoami if git is unset.", "2026-06-14T10:05:00Z")] }),
    D("bd-9f2a.4", "bd doctor / version preflight", "chore", "open", 2, "amp-bot", "amp-bot", "bd-9f2a", { description: "Run bd doctor + bd --version on boot; warn on schema_version drift." }),
    D("bd-9f2a.5", "Serialize writes through a mutex queue", "task", "open", 1, "stevey", "stevey", "bd-9f2a", { description: "Embedded Dolt is single-writer. Queue writes so concurrent UI actions can't collide.", blocks: ["bd-9f2a.1"] }),
    // M1 children
    D("bd-3c71.1", "Board columns + card component", "feature", "in_progress", 1, "cursor-agent", "cursor-agent", "bd-3c71", { description: "Five-column board; dense cards with id, type, priority, assignee, origin, counts.", comments: [cm("stevey", "Let's keep cards draggable but open detail on click.", "2026-06-15T14:00:00Z")] }),
    D("bd-3c71.2", "Top bar filters + text search", "feature", "open", 2, "stevey", "", "bd-3c71", { description: "Status/type/priority/label/assignee filters + fuzzy text search.", blocks: ["bd-3c71.1"] }),
    D("bd-3c71.3", "Origin badge (human vs agent)", "feature", "open", 2, "stevey", "dana", "bd-3c71", { description: "Derive origin from created_by vs the human allowlist; badge + tooltip." }),
    D("bd-3c71.4", "Detail drawer (read-only)", "feature", "open", 2, "claude-agent", "claude-agent", "bd-3c71", { description: "Full fields, deps panel, comments thread, activity. From bd show <id>.", blocks: ["bd-3c71.1"] }),
    D("bd-3c71.5", "Empty / loading / error states", "chore", "deferred", 3, "stevey", "", "bd-3c71", { description: "Skeletons, empty columns, typed BdError surfaces." }),
    // M2 children
    D("bd-7e40.1", "Create modal + bd create wiring", "feature", "open", 1, "stevey", "stevey", "bd-7e40", { description: "Type, title, description, priority, assignee, labels, parent epic. Zod-validated." }),
    D("bd-7e40.2", "Inline edit (send only changed fields)", "feature", "deferred", 2, "amp-bot", "", "bd-7e40", { description: "bd update <id> with only the changed flags." }),
    D("bd-7e40.3", "Comments thread + composer", "feature", "open", 2, "stevey", "dana", "bd-7e40", { description: "Author-stamped comments; newest-last with relative time." }),
    D("bd-7e40.4", "Attribution stamping (BEADS_ACTOR)", "task", "open", 1, "stevey", "stevey", "bd-7e40", { description: "Every UI write runs with BEADS_ACTOR=<humanActor>." }),
    D("bd-7e40.5", "Optimistic updates + toasts", "task", "deferred", 2, "claude-agent", "", "bd-7e40", { description: "TanStack Query optimistic mutations with rollback on adapter error." }),
    // M3 children
    D("bd-b18d.1", "Backlog ↔ Ready drag-and-drop", "feature", "deferred", 2, "stevey", "", "bd-b18d", { description: "dnd-kit; de-defer on drop to Ready, land in Blocked if still dep-blocked." }),
    D("bd-b18d.2", "Kanban status columns", "feature", "deferred", 3, "stevey", "", "bd-b18d", { description: "open → in_progress → closed via columns." }),
    D("bd-b18d.3", "Archive = close + label archived", "chore", "deferred", 3, "amp-bot", "", "bd-b18d", { description: "No native bd archive; reversible close+label, hidden by a standing filter." }),
    D("bd-b18d.4", "Epic progress bars", "feature", "deferred", 3, "stevey", "", "bd-b18d", { description: "closed ÷ total children, computed client-side for live render." }),
    // M4 children
    D("bd-c552.1", "React Flow graph scaffold", "spike", "deferred", 3, "claude-agent", "", "bd-c552", { description: "Nodes = beads, typed edges; pan/zoom; scope to an epic neighborhood." }),
    D("bd-c552.2", "Drag-to-link with cycle check", "feature", "deferred", 3, "stevey", "", "bd-c552", { description: "Drag node→node to create a dep; bd dep cycles refuses cycles.", blocks: ["bd-c552.1"] }),
    D("bd-c552.3", "bd dep cycles validation", "task", "deferred", 3, "cursor-agent", "", "bd-c552", { description: "Server-side cycle guard before committing blocks/parent-child edges." }),
    // M5 children
    D("bd-1a09.1", "Keyboard nav (n, /, j, k, e)", "chore", "deferred", 4, "stevey", "", "bd-1a09", { description: "Keyboard-first board: new, search, navigate, edit." }),
    D("bd-1a09.2", "Playwright e2e flows", "chore", "deferred", 4, "amp-bot", "", "bd-1a09", { description: "End-to-end the create→drag→comment→archive flows." }),
    D("bd-1a09.3", "README + setup docs", "story", "closed", 4, "stevey", "stevey", "bd-1a09", { description: "Setup, bd version range, troubleshooting.", closed_at: "2026-06-17T09:00:00Z" }),
    // loose beads
    D("bd-44b1", "Decision: Backlog = deferred status", "decision", "closed", 1, "stevey", "stevey", null, { description: "Map the Backlog column to beads' built-in deferred status rather than inventing new schema.", comments: [cm("dana", "Agreed — zero new persisted state, stays correct with bd.", "2026-06-08T16:00:00Z")] }),
    D("bd-8d3e", "Bug: ready queue shows deferred beads", "bug", "open", 0, "claude-agent", "stevey", null, { description: "bd ready should exclude deferred; some deferred beads leak into Ready in the UI cache.", related: ["bd-3c71.1"], comments: [cm("claude-agent", "Repro: defer a bead, it stays in Ready until refetch.", "2026-06-16T08:00:00Z")] }),
    D("bd-2f9c", "Bug: drag-drop flickers on rollback", "bug", "blocked", 1, "cursor-agent", "cursor-agent", null, { description: "Optimistic move then adapter error causes a visible flicker on rollback.", related: ["bd-b18d.1"] }),
    D("bd-5a77", "Switch integration to a REST API", "task", "closed", 3, "amp-bot", "amp-bot", null, { description: "Superseded — beads has no HTTP API; we shell out to the CLI.", labels: ["archived"], closed_at: "2026-06-07T10:00:00Z" }),

    // ── Showcase beads for the newer features (Needs-You, checklists, Insights, Achievements) ──
    // Needs-You inbox: agent-escalated decisions (the `human` label, still open).
    D("bd-hmn1", "Need a human call: which OAuth provider for sign-in?", "decision", "open", 1, "claude-agent", "stevey", null, { description: "I can wire Clerk, Auth0, or Descope. Clerk is the native Marketplace option — but you own this call before I build the middleware.", labels: ["human"], created_at: "2026-06-24T08:30:00Z", updated_at: "2026-06-24T08:30:00Z" }),
    D("bd-hmn2", "Decision needed: drop the legacy CSV export?", "decision", "open", 2, "cursor-agent", "", null, { description: "Usage is near zero and it blocks the new report template. OK to remove it?", labels: ["human"], created_at: "2026-06-24T09:10:00Z", updated_at: "2026-06-24T09:10:00Z" }),
    // Markdown + interactive checklist in the description.
    D("bd-ck1", "Ship the onboarding flow", "feature", "in_progress", 1, "stevey", "stevey", null, { description: "Guided first-run experience.\n\n## Acceptance criteria\n- [x] Detect first launch\n- [x] Welcome step with the project picker\n- [ ] Sample project seeding\n- [ ] Dismiss + don't-show-again\n- [ ] Docs link\n\nSee the **[spec](https://beadmeupscotty.com)** for the full flow.", created_at: "2026-06-20T10:00:00Z", updated_at: "2026-06-24T11:00:00Z", comments: [cm("dana", "Love it — keep the welcome step to one screen.", "2026-06-24T11:30:00Z")] }),
    // Recent consecutive closes by the human actor → streak, throughput, XP, badges.
    D("bd-win1", "Fix flaky drag-drop rollback", "bug", "closed", 1, "stevey", "stevey", null, { description: "Coalesce optimistic moves so rollback no longer flickers.", created_at: "2026-06-19T09:00:00Z", closed_at: "2026-06-21T16:30:00Z" }),
    D("bd-win2", "Speed up board first paint", "task", "closed", 2, "stevey", "stevey", null, { description: "Memoize the index and lazy-load the graph bundle.", created_at: "2026-06-20T09:00:00Z", closed_at: "2026-06-22T14:00:00Z" }),
    D("bd-win3", "Land the search index everything waited on", "task", "closed", 0, "stevey", "stevey", null, { description: "Unblocks the filter rollout.", blocks: ["bd-3c71.2"], created_at: "2026-06-21T09:00:00Z", closed_at: "2026-06-23T13:00:00Z" }),
    D("bd-win4", "Polish the empty states", "chore", "closed", 2, "stevey", "stevey", null, { description: "Friendly skeletons and zero-states across views.", created_at: "2026-06-23T09:00:00Z", closed_at: "2026-06-24T10:00:00Z" }),
    D("bd-win5", "Tidy the settings layout", "chore", "closed", 2, "stevey", "stevey", null, { description: "Group attribution, freshness, and theme into cards.", created_at: "2026-06-23T15:00:00Z", closed_at: "2026-06-24T12:00:00Z" }),
    // A closed epic → Epic Slayer badge.
    D("bd-epic-x", "Onboarding & polish (M6)", "epic", "closed", 1, "stevey", "stevey", null, { description: "First-run onboarding, empty states, and a performance pass.", created_at: "2026-06-15T09:00:00Z", closed_at: "2026-06-24T10:30:00Z" }),
    // Agent closes so the leaderboard has real competition.
    D("bd-ag1", "Auto-label stale beads", "task", "closed", 2, "claude-agent", "claude-agent", null, { description: "Nightly sweep tags beads with no activity in 14 days.", created_at: "2026-06-18T09:00:00Z", closed_at: "2026-06-22T20:00:00Z" }),
    D("bd-ag2", "Generate the weekly digest", "task", "closed", 3, "cursor-agent", "cursor-agent", null, { description: "Summarize closed work into a shareable digest.", created_at: "2026-06-19T09:00:00Z", closed_at: "2026-06-23T21:00:00Z" }),
    D("bd-ag3", "Backfill missing assignees", "chore", "closed", 3, "claude-agent", "claude-agent", null, { description: "Infer assignee from the last status-change actor.", created_at: "2026-06-20T09:00:00Z", closed_at: "2026-06-24T07:00:00Z" }),
  ];
}
