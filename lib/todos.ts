import type { Bead, BeadType, UpdateInput } from "./schema";

/**
 * A bead is a todo iff it is still open (not deferred/closed) and
 * `issue_type` is task — matching `bd todo list`. In-progress tasks count;
 * features do not.
 */
export function isTodo(bead: Bead): boolean {
  return (
    bead.issue_type === "task" &&
    bead.status !== "closed" &&
    bead.status !== "deferred"
  );
}

export function listOpenTodos(beads: Bead[]): Bead[] {
  return beads.filter(isTodo);
}

/** Promote a todo to another issue type (removes it from the Todos inbox). */
export function promoteType(issueType: BeadType): UpdateInput {
  return { issue_type: issueType };
}

/** Raise priority (0 = highest, 4 = lowest). */
export function raisePriority(priority: number): UpdateInput {
  return { priority };
}

/** Attach to a parent epic or issue (`bd update --parent`). */
export function attachParent(parentId: string): UpdateInput {
  return { parent: parentId };
}

/** Assign to a person (`bd update --assignee`). */
export function assign(assignee: string): UpdateInput {
  return { assignee };
}

/** argv for `bd defer <id> --until <phrase> [--reason …]`. */
export function deferArgv(id: string, until: string, reason?: string): string[] {
  const args = ["defer", id, "--until", until];
  const trimmed = reason?.trim();
  if (trimmed) args.push("--reason", trimmed);
  return args;
}
