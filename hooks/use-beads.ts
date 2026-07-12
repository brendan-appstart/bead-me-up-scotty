"use client";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type BeadsResponse } from "@/lib/api-client";
import type { Bead, CreateInput, UpdateInput, DepType } from "@/lib/schema";
import { useApp } from "@/components/app-context";

/** Query key is scoped per project so tabs on different projects never collide. */
export const beadsKey = (projectId: string) => ["beads", projectId] as const;
export const activityKey = (projectId: string) => ["activity", projectId] as const;

export function useBeads(projectId: string) {
  return useQuery({
    queryKey: beadsKey(projectId),
    queryFn: () => api.list(projectId),
    refetchInterval: (q) => q.state.data?.meta.pollIntervalMs ?? 5000,
  });
}

/** Recent activity feed for a project. Invalidated by the SSE stream on change;
 *  the interval is just a fallback. */
export function useActivity(projectId: string) {
  return useQuery({
    queryKey: activityKey(projectId),
    queryFn: () => api.activity(projectId),
    refetchInterval: 20000,
  });
}

/** Flow-metrics for the Insights dashboard over a rolling window of `days`. */
export function useInsights(projectId: string, days: number) {
  return useQuery({
    queryKey: ["insights", projectId, days],
    queryFn: () => api.insights(projectId, days),
    refetchInterval: 30000,
  });
}

/** Gamification XP/level stats. Only enabled when the feature is opted in. */
export function useGamification(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["gamification", projectId],
    queryFn: () => api.gamification(projectId),
    enabled,
    refetchInterval: 30000,
  });
}

function patchCache(
  prev: BeadsResponse | undefined,
  id: string,
  patch: Partial<Bead>,
): BeadsResponse | undefined {
  if (!prev) return prev;
  return {
    ...prev,
    beads: prev.beads.map((b) => (b.id === id ? { ...b, ...patch } : b)),
  };
}

export function useSetStatus() {
  const { projectId } = useApp();
  const qc = useQueryClient();
  const KEY = beadsKey(projectId);
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.setStatus(projectId, id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<BeadsResponse>(KEY);
      qc.setQueryData<BeadsResponse>(KEY, (p) => patchCache(p, id, { status }));
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      toast.error((err as Error).message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

function mutationToast<TArgs, TRes>(
  fn: (args: TArgs) => Promise<TRes>,
  message: (args: TArgs, res: TRes) => string,
  qc: ReturnType<typeof useQueryClient>,
  key: readonly unknown[],
) {
  return {
    mutationFn: fn,
    onSuccess: (res: TRes, args: TArgs) => {
      toast.success(message(args, res));
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  };
}

export function useCreateBead() {
  const { projectId } = useApp();
  const qc = useQueryClient();
  return useMutation(
    mutationToast<CreateInput, Bead>(
      (input) => api.create(projectId, input),
      (_a, res) => `Created ${res.id} · bd create`,
      qc,
      beadsKey(projectId),
    ),
  );
}

export function useUpdateBead() {
  const { projectId } = useApp();
  const qc = useQueryClient();
  return useMutation(
    mutationToast<{ id: string; patch: UpdateInput }, Bead>(
      ({ id, patch }) => api.update(projectId, id, patch),
      () => "Updated · bd update",
      qc,
      beadsKey(projectId),
    ),
  );
}

export function useDeleteBead() {
  const { projectId } = useApp();
  const qc = useQueryClient();
  return useMutation(
    mutationToast<string, { deleted: string }>(
      (id) => api.remove(projectId, id),
      (id) => `Deleted ${id} · bd delete`,
      qc,
      beadsKey(projectId),
    ),
  );
}

export function useAddComment() {
  const { projectId } = useApp();
  const qc = useQueryClient();
  return useMutation(
    mutationToast<{ id: string; text: string }, Bead>(
      ({ id, text }) => api.addComment(projectId, id, text),
      () => "Comment added",
      qc,
      beadsKey(projectId),
    ),
  );
}

export function useAddDep() {
  const { projectId } = useApp();
  const qc = useQueryClient();
  return useMutation(
    mutationToast<{ id: string; dependsOnId: string; type: DepType }, Bead>(
      ({ id, dependsOnId, type }) => api.addDep(projectId, id, dependsOnId, type),
      () => "Dependency added · bd dep add",
      qc,
      beadsKey(projectId),
    ),
  );
}

export function useRemoveDep() {
  const { projectId } = useApp();
  const qc = useQueryClient();
  return useMutation(
    mutationToast<{ id: string; dependsOnId: string }, Bead>(
      ({ id, dependsOnId }) => api.removeDep(projectId, id, dependsOnId),
      () => "Dependency removed · bd dep remove",
      qc,
      beadsKey(projectId),
    ),
  );
}

/** Create a human approval gate blocking `id` (bd gate create --type human). */
export function useCreateGate() {
  const { projectId } = useApp();
  const qc = useQueryClient();
  return useMutation(
    mutationToast<{ id: string; reason?: string }, Bead>(
      ({ id, reason }) => api.createGate(projectId, id, reason),
      (_a, res) => `Created approval gate ${res.id} · bd gate create`,
      qc,
      beadsKey(projectId),
    ),
  );
}

/** "Needs You" inbox: respond (comment + close) or dismiss (drop the human label). */
export function useRespondHuman() {
  const { projectId } = useApp();
  const qc = useQueryClient();
  return useMutation(
    mutationToast<{ id: string; text: string }, Bead>(
      ({ id, text }) => api.human.respond(projectId, id, text),
      (a) => `Responded to ${a.id}`,
      qc,
      beadsKey(projectId),
    ),
  );
}

export function useDismissHuman() {
  const { projectId } = useApp();
  const qc = useQueryClient();
  return useMutation(
    mutationToast<{ id: string }, Bead>(
      ({ id }) => api.human.dismiss(projectId, id),
      (a) => `Dismissed ${a.id}`,
      qc,
      beadsKey(projectId),
    ),
  );
}

export function useArchiveBead() {
  const { projectId } = useApp();
  const qc = useQueryClient();
  return useMutation(
    mutationToast<string, Bead>(
      (id) => api.archive(projectId, id),
      (id) => `Archived ${id} · bd close + label`,
      qc,
      beadsKey(projectId),
    ),
  );
}
