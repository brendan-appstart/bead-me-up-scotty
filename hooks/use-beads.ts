"use client";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type BeadsResponse } from "@/lib/api-client";
import type { Bead, CreateInput, UpdateInput, DepType } from "@/lib/schema";

const KEY = ["beads"] as const;

export function useBeads() {
  return useQuery({
    queryKey: KEY,
    queryFn: api.list,
    refetchInterval: (q) => q.state.data?.meta.pollIntervalMs ?? 5000,
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.setStatus(id, status),
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
) {
  return {
    mutationFn: fn,
    onSuccess: (res: TRes, args: TArgs) => {
      toast.success(message(args, res));
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  };
}

export function useCreateBead() {
  const qc = useQueryClient();
  return useMutation(
    mutationToast<CreateInput, Bead>(
      api.create,
      (_a, res) => `Created ${res.id} · bd create`,
      qc,
    ),
  );
}

export function useUpdateBead() {
  const qc = useQueryClient();
  return useMutation(
    mutationToast<{ id: string; patch: UpdateInput }, Bead>(
      ({ id, patch }) => api.update(id, patch),
      () => "Updated · bd update",
      qc,
    ),
  );
}

export function useDeleteBead() {
  const qc = useQueryClient();
  return useMutation(
    mutationToast<string, { deleted: string }>(
      api.remove,
      (id) => `Deleted ${id} · bd delete`,
      qc,
    ),
  );
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation(
    mutationToast<{ id: string; text: string }, Bead>(
      ({ id, text }) => api.addComment(id, text),
      () => "Comment added",
      qc,
    ),
  );
}

export function useAddDep() {
  const qc = useQueryClient();
  return useMutation(
    mutationToast<{ id: string; dependsOnId: string; type: DepType }, Bead>(
      ({ id, dependsOnId, type }) => api.addDep(id, dependsOnId, type),
      () => "Dependency added · bd dep add",
      qc,
    ),
  );
}

export function useRemoveDep() {
  const qc = useQueryClient();
  return useMutation(
    mutationToast<{ id: string; dependsOnId: string }, Bead>(
      ({ id, dependsOnId }) => api.removeDep(id, dependsOnId),
      () => "Dependency removed · bd dep remove",
      qc,
    ),
  );
}

export function useArchiveBead() {
  const qc = useQueryClient();
  return useMutation(
    mutationToast<string, Bead>(
      api.archive,
      (id) => `Archived ${id} · bd close + label`,
      qc,
    ),
  );
}
