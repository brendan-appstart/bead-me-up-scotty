import type { Bead } from "./schema";

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
