"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toastError } from "@/components/error-toast";
import { api, ApiError } from "@/lib/api-client";
import { formulasKey } from "@/hooks/use-formulas";

export const molKey = (projectId: string, epicId: string) =>
  ["mol", projectId, epicId] as const;

export function useMol(projectId: string, epicId: string | null, enabled: boolean) {
  const query = useQuery({
    queryKey: molKey(projectId, epicId ?? ""),
    queryFn: () => api.mol.snapshot(projectId, epicId ?? ""),
    enabled: enabled && !!epicId,
  });
  React.useEffect(() => {
    if (!query.error) return;
    if (query.error instanceof ApiError && query.error.status === 404) return;
    toastError(query.error);
  }, [query.error]);
  return query;
}

export function useDistillMol(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      epicId: string;
      name: string;
      vars?: Record<string, string>;
    }) => api.mol.distill(projectId, input.epicId, { name: input.name, vars: input.vars }),
    onError: (err: unknown) => toastError(err),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: formulasKey(projectId) });
      qc.invalidateQueries({ queryKey: molKey(projectId, vars.epicId) });
      if (res.demo || res.message) {
        toast.message(res.message || "Demo mode cannot write a formula file.");
        return;
      }
      toast.success(
        res.formula ? `Saved formula ${res.formula}` : `Distilled ${vars.name}`,
      );
    },
  });
}
