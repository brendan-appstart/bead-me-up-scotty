/** Shared server/client types for version discovery and exact-target updates. */
export type UpdateChannel = "stable" | "development";
export interface UpdateTarget { channel: UpdateChannel; sha: string; tag?: string }
export interface UpdateStatus {
  channel: UpdateChannel;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  updateAvailable: boolean;
  canUpdate: boolean;
  manualReason?: string;
  target?: UpdateTarget;
  isGitRepo: boolean;
  supervised: boolean;
  behind: number;
  localSha: string;
  remoteSha: string;
  error?: string;
}
export interface UpdateStep { name: string; ok: boolean; output: string }
export interface UpdateResult { ok: boolean; steps: UpdateStep[]; restarting: boolean; fromSha: string; toSha: string }
