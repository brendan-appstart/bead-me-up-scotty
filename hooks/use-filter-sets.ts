"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { FilterSetSnapshot } from "@/lib/filter-sets";
import { toastError } from "@/components/error-toast";

/** Named filter presets, scoped per project (stored in app config). */
export const filterSetsKey = (projectId: string) => ["filter-sets", projectId] as const;

type FilterSetsData = { sets: import("@/lib/filter-sets").FilterSet[] };

export function useFilterSets(projectId: string) {
  return useQuery({
    queryKey: filterSetsKey(projectId),
    queryFn: () => api.filterSets.list(projectId),
    staleTime: 60_000,
  });
}

export function useCreateFilterSet(projectId: string) {
  const qc = useQueryClient();
  const KEY = filterSetsKey(projectId);
  return useMutation({
    mutationFn: ({
      name,
      snapshot,
      overwrite,
    }: {
      name: string;
      snapshot: FilterSetSnapshot;
      overwrite?: boolean;
    }) => api.filterSets.create(projectId, name, snapshot, overwrite),
    onMutate: async ({ name, snapshot, overwrite }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<FilterSetsData>(KEY);
      if (!overwrite) {
        qc.setQueryData<FilterSetsData>(KEY, (current) => ({
          sets: [
            ...(current?.sets ?? []),
            {
              id: `optimistic-${name}`,
              name,
              snapshot,
            },
          ],
        }));
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      toastError(err);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRenameFilterSet(projectId: string) {
  const qc = useQueryClient();
  const KEY = filterSetsKey(projectId);
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.filterSets.rename(projectId, id, name),
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<FilterSetsData>(KEY);
      qc.setQueryData<FilterSetsData>(KEY, (current) => ({
        sets: (current?.sets ?? []).map((set) => (set.id === id ? { ...set, name } : set)),
      }));
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      toastError(err);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteFilterSet(projectId: string) {
  const qc = useQueryClient();
  const KEY = filterSetsKey(projectId);
  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.filterSets.delete(projectId, id),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<FilterSetsData>(KEY);
      qc.setQueryData<FilterSetsData>(KEY, (current) => ({
        sets: (current?.sets ?? []).filter((set) => set.id !== id),
      }));
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      toastError(err);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
