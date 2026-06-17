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
export interface DoctorResponse {
  kind: "bd" | "demo";
  ok: boolean;
  version?: string;
  repoPath: string;
  message: string;
  config: {
    repoPath: string;
    humanActor: string;
    humanAllowlist: string[];
    pollIntervalMs: number;
    demo: boolean;
  };
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

export const api = {
  list: () => request<BeadsResponse>("/api/beads"),
  get: (id: string) => request<Bead>(`/api/beads/${id}`),
  create: (input: CreateInput) =>
    request<Bead>("/api/beads", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, patch: UpdateInput) =>
    request<Bead>(`/api/beads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  setStatus: (id: string, status: string) =>
    request<Bead>(`/api/beads/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  remove: (id: string) => request<{ deleted: string }>(`/api/beads/${id}`, { method: "DELETE" }),
  addComment: (id: string, text: string) =>
    request<Bead>(`/api/beads/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  addDep: (id: string, depends_on_id: string, type: DepType) =>
    request<Bead>(`/api/beads/${id}/deps`, {
      method: "POST",
      body: JSON.stringify({ depends_on_id, type }),
    }),
  removeDep: (id: string, depends_on_id: string) =>
    request<Bead>(`/api/beads/${id}/deps`, {
      method: "DELETE",
      body: JSON.stringify({ depends_on_id }),
    }),
  archive: (id: string) => request<Bead>(`/api/beads/${id}/archive`, { method: "POST" }),
  doctor: () => request<DoctorResponse>("/api/doctor"),
  saveConfig: (patch: Record<string, unknown>) =>
    request<DoctorResponse["config"]>("/api/config", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
};
