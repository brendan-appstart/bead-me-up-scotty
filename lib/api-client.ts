import type { Bead, CreateInput, UpdateInput, DepType } from "./schema";

export interface Meta {
  kind: "bd" | "demo";
  humanActor: string;
  humanAllowlist: string[];
  pollIntervalMs: number;
}
export interface BeadsResponse {
  beads: Bead[];
  meta: Meta;
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
