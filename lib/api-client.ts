import type { Bead, CreateInput, UpdateInput, DepType } from "./schema";

export interface Meta {
  kind: "bd" | "demo";
  humanActor: string;
  humanAllowlist: string[];
  pollIntervalMs: number;
  gamification?: boolean;
}
export interface BeadsResponse {
  beads: Bead[];
  meta: Meta;
}

export interface ActivityItem {
  id: string;
  issueId: string;
  title: string;
  actor: string;
  origin: "human" | "agent";
  action: string;
  detail?: string;
  at: string;
}
export interface ActivityResponse {
  items: ActivityItem[];
}

export interface InsightsData {
  days: number;
  throughput: { date: string; human: number; agent: number; total: number }[];
  createdClosed: { date: string; created: number; closed: number }[];
  cycle: {
    overall: { p50: number; p90: number; count: number };
    human: { p50: number; p90: number; count: number };
    agent: { p50: number; p90: number; count: number };
  };
  aging: { id: string; title: string; days: number; origin: "human" | "agent" }[];
  columns: { id: string; name: string; color: string; count: number }[];
  hasEvents: boolean;
}

export interface AssistResult {
  description: string;
  acceptance: string;
  labels: string[];
  duplicates: { id: string; title: string; reason: string }[];
}

export interface ActorStat {
  actor: string;
  origin: "human" | "agent";
  xp: number;
  closed: number;
  currentStreak: number;
  longestStreak: number;
}
export interface Badge {
  key: string;
  label: string;
  description: string;
  earned: boolean;
}
export interface GamificationData {
  actors: ActorStat[];
  totalXp: number;
  totalClosed: number;
  you: ActorStat & { level: number; intoLevel: number; span: number; progress: number; badges: Badge[] };
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string | null;
  addedAt?: string;
  lastOpened?: string;
  hasBeads: boolean;
}
export interface ProjectsResponse {
  projects: ProjectInfo[];
}

export interface DoctorResponse {
  kind: "bd" | "demo";
  ok: boolean;
  version?: string;
  repoPath: string;
  message: string;
  project: { id: string; name: string; path: string | null } | null;
  config: {
    humanActor: string;
    humanAllowlist: string[];
    pollIntervalMs: number;
  };
}

export interface FsEntry {
  name: string;
  path: string;
  hasBeads: boolean;
}
export interface FsResponse {
  path: string;
  parent: string | null;
  home: string;
  hasBeads: boolean;
  entries: FsEntry[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return body as T;
}

const enc = encodeURIComponent;
const base = (projectId: string) => `/api/p/${enc(projectId)}`;

export const api = {
  list: (projectId: string) => request<BeadsResponse>(`${base(projectId)}/beads`),
  get: (projectId: string, id: string) => request<Bead>(`${base(projectId)}/beads/${enc(id)}`),
  create: (projectId: string, input: CreateInput) =>
    request<Bead>(`${base(projectId)}/beads`, { method: "POST", body: JSON.stringify(input) }),
  update: (projectId: string, id: string, patch: UpdateInput) =>
    request<Bead>(`${base(projectId)}/beads/${enc(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  setStatus: (projectId: string, id: string, status: string) =>
    request<Bead>(`${base(projectId)}/beads/${enc(id)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  remove: (projectId: string, id: string) =>
    request<{ deleted: string }>(`${base(projectId)}/beads/${enc(id)}`, { method: "DELETE" }),
  addComment: (projectId: string, id: string, text: string) =>
    request<Bead>(`${base(projectId)}/beads/${enc(id)}/comments`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  addDep: (projectId: string, id: string, depends_on_id: string, type: DepType) =>
    request<Bead>(`${base(projectId)}/beads/${enc(id)}/deps`, {
      method: "POST",
      body: JSON.stringify({ depends_on_id, type }),
    }),
  removeDep: (projectId: string, id: string, depends_on_id: string) =>
    request<Bead>(`${base(projectId)}/beads/${enc(id)}/deps`, {
      method: "DELETE",
      body: JSON.stringify({ depends_on_id }),
    }),
  archive: (projectId: string, id: string) =>
    request<Bead>(`${base(projectId)}/beads/${enc(id)}/archive`, { method: "POST" }),
  doctor: (projectId: string) => request<DoctorResponse>(`${base(projectId)}/doctor`),

  activity: (projectId: string) => request<ActivityResponse>(`${base(projectId)}/activity`),

  insights: (projectId: string, days: number) =>
    request<InsightsData>(`${base(projectId)}/insights?days=${days}`),

  gamification: (projectId: string) =>
    request<GamificationData>(`${base(projectId)}/gamification`),

  assist: (projectId: string, id: string) =>
    request<AssistResult>(`${base(projectId)}/beads/${enc(id)}/assist`, { method: "POST" }),

  // Act on a "Needs You" (human-labelled) bead, mirroring `bd human`.
  human: {
    respond: (projectId: string, id: string, text: string) =>
      request<Bead>(`${base(projectId)}/beads/${enc(id)}/human`, {
        method: "POST",
        body: JSON.stringify({ action: "respond", text }),
      }),
    dismiss: (projectId: string, id: string) =>
      request<Bead>(`${base(projectId)}/beads/${enc(id)}/human`, {
        method: "POST",
        body: JSON.stringify({ action: "dismiss" }),
      }),
  },

  // Manual per-column board ordering (stored in app config, not in beads).
  order: {
    get: (projectId: string) =>
      request<{ orders: Record<string, string[]> }>(`${base(projectId)}/order`),
    set: (projectId: string, columnId: string, ids: string[]) =>
      request<{ orders: Record<string, string[]> }>(`${base(projectId)}/order`, {
        method: "PUT",
        body: JSON.stringify({ columnId, ids }),
      }),
  },

  // Image attachments stored under <repo>/.beads/attachments/<beadId>/.
  attachments: {
    upload: async (projectId: string, beadId: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("beadId", beadId);
      // No JSON Content-Type — let the browser set the multipart boundary.
      const res = await fetch(`${base(projectId)}/attachments`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error || `Upload failed (${res.status})`);
      }
      return body as { ref: string; url: string; name: string };
    },
    finalize: (projectId: string, draftId: string, beadId: string) =>
      request<{ moved: boolean }>(`${base(projectId)}/attachments`, {
        method: "PUT",
        body: JSON.stringify({ draftId, beadId }),
      }),
    /** Map an `attachment://<beadId>/<file>` ref to its serve URL. */
    urlFor: (projectId: string, ref: string) => {
      const rel = ref.replace(/^attachment:\/\//, "");
      const encoded = rel
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/");
      return `${base(projectId)}/attachments/${encoded}`;
    },
  },

  // Publish/showcase: build a static Eleventy site from a project's beads.
  showcase: {
    build: (
      projectId: string,
      opts: {
        template: string;
        title: string;
        scope: "project" | "all";
        stats: boolean;
        search: boolean;
        gamification?: boolean;
      },
    ) =>
      request<{ outDir: string; indexPath: string; count: number }>(`${base(projectId)}/publish`, {
        method: "POST",
        body: JSON.stringify({ action: "build", ...opts }),
      }),
    open: (projectId: string, path: string) =>
      request<{ opened: boolean }>(`${base(projectId)}/publish`, {
        method: "POST",
        body: JSON.stringify({ action: "open", path }),
      }),
    deploy: (projectId: string, path: string) =>
      request<{ deployed: boolean; url?: string; error?: string; hint?: string }>(`${base(projectId)}/publish`, {
        method: "POST",
        body: JSON.stringify({ action: "deploy", path }),
      }),
  },

  saveConfig: (patch: Record<string, unknown>) =>
    request<DoctorResponse["config"]>("/api/config", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  projects: {
    list: () => request<ProjectsResponse>("/api/projects"),
    add: (path: string) =>
      request<ProjectInfo>("/api/projects", { method: "POST", body: JSON.stringify({ path }) }),
    remove: (id: string) =>
      request<{ removed: string }>(`/api/projects/${enc(id)}`, { method: "DELETE" }),
    rename: (id: string, name: string) =>
      request<ProjectInfo>(`/api/projects/${enc(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
  },

  fs: {
    browse: (path?: string) =>
      request<FsResponse>(`/api/fs${path ? `?path=${enc(path)}` : ""}`),
  },
};
