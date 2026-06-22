"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

/** Manual board ordering, scoped per project (stored in app config). */
export const orderKey = (projectId: string) => ["order", projectId] as const;

type Orders = { orders: Record<string, string[]> };

export function useOrder(projectId: string) {
  return useQuery({
    queryKey: orderKey(projectId),
    queryFn: () => api.order.get(projectId),
    // Order rarely changes out from under us; the SSE stream covers bead data.
    staleTime: 60_000,
  });
}

export function useSetOrder(projectId: string) {
  const qc = useQueryClient();
  const KEY = orderKey(projectId);
  return useMutation({
    mutationFn: ({ columnId, ids }: { columnId: string; ids: string[] }) =>
      api.order.set(projectId, columnId, ids),
    onMutate: async ({ columnId, ids }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Orders>(KEY);
      qc.setQueryData<Orders>(KEY, (p) => ({
        orders: { ...(p?.orders ?? {}), [columnId]: ids },
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
