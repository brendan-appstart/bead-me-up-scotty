/**
 * Client-safe catalog of local CLIs used by Refine with AI.
 * Keep this module free of `server-only` so the drawer and Settings can import it.
 */

export const AI_PROVIDER_IDS = ["opencode", "claude", "cursor", "codex"] as const;
export type AiProvider = (typeof AI_PROVIDER_IDS)[number];

export const DEFAULT_AI_PROVIDER: AiProvider = "opencode";

export const AI_PROVIDERS: {
  id: AiProvider;
  label: string;
  binEnv: string;
  bin: string;
}[] = [
  { id: "opencode", label: "OpenCode", binEnv: "OPENCODE_BIN", bin: "opencode" },
  { id: "claude", label: "Claude", binEnv: "CLAUDE_BIN", bin: "claude" },
  { id: "cursor", label: "Cursor CLI", binEnv: "CURSOR_BIN", bin: "agent" },
  { id: "codex", label: "Codex", binEnv: "CODEX_BIN", bin: "codex" },
];

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export function aiProviderLabel(id: AiProvider): string {
  return AI_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}
