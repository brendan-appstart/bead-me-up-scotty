/**
 * Shared wire types for the self-update feature (bead bgb). Plain interfaces with
 * no runtime code, so BOTH the server-only producer (lib/self-update.ts) and the
 * client API layer (lib/api-client.ts) can import them — the client can't import
 * the `server-only` self-update module directly. Keep this the single source of
 * truth for the shapes; do not redeclare them elsewhere.
 */

export interface UpdateStatus {
  isGitRepo: boolean;
  supervised: boolean;
  behind: number;
  localSha: string;
  remoteSha: string;
  error?: string;
}

export interface UpdateStep {
  name: string;
  ok: boolean;
  output: string;
}

export interface UpdateResult {
  ok: boolean;
  steps: UpdateStep[];
  restarting: boolean;
  fromSha: string;
  toSha: string;
}
