import type { Bead } from "./schema";

export type Origin = "human" | "agent";

/**
 * beads has no human-vs-agent flag — attribution is the free-text `created_by`.
 * The UI stamps its own writes with the configured human actor, and anyone in
 * the human allowlist is treated as human; everyone else is an agent (spec §6).
 */
export function originOf(name: string | undefined, humanAllowlist: string[]): Origin {
  if (name && humanAllowlist.includes(name)) return "human";
  return "agent";
}

export function beadOrigin(b: Bead, humanAllowlist: string[]): Origin {
  return originOf(b.created_by, humanAllowlist);
}

export function originTitle(name: string | undefined, origin: Origin): string {
  const who = name || "unknown";
  return origin === "human" ? `Human · ${who}` : `Agent · ${who}`;
}
