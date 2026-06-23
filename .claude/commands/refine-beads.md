---
description: Review open bead issues and refine them to be implementation-ready
argument-hint: "[optional: issue ids or filter, e.g. beads-12 beads-15 — defaults to all open]"
---

Refine open bead issues so each one is unambiguous and ready to pick up cold.

**Scope:** If `$ARGUMENTS` is provided, refine only those issues; otherwise refine every open issue (`bd list --status=open`).

Work in three passes — do not start editing until I've answered your questions.

## 1. Assess
Run `bd show <id>` for each in-scope issue. For each, judge whether it has enough detail to implement confidently:
- **Scope** — clear, bounded statement of what's in and out
- **Acceptance criteria** — how we'll know it's done
- **Design/context** — relevant decisions, constraints, or links
- **Dependencies** — what blocks it or what it blocks

## 2. Ask (batched, all at once)
Gather your clarifying questions across **all** in-scope issues first, then present them to me in a single batch grouped by issue, so I can answer in one pass. Ask only what you genuinely need to make each bead implementable — don't pad with questions you can already answer from the issue or the codebase.

## 3. Update
Once I've answered, update each bead using my responses:
`bd update <id> --description/--design/--notes/--acceptance`

Then show me a concise **before/after** for every issue you changed.

**Rules:**
- Do not invent details I didn't confirm — if something stays unclear, flag it instead of guessing.
- Don't change priority or dependencies unless I asked you to.
- Don't commit, push, or run Dolt sync; `bd update` writes locally and that's enough.
