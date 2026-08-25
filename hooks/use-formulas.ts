"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toastError } from "@/components/error-toast";
import { api } from "@/lib/api-client";
import { beadsKey } from "@/hooks/use-beads";
import type { PourPhase } from "@/lib/formulas";

export const formulasKey = (projectId: string) => ["formulas", projectId] as const;
export const formulaKey = (projectId: string, name: string) =>
  ["formula", projectId, name] as const;

export function useFormulas(projectId: string) {
  const query = useQuery({
    queryKey: formulasKey(projectId),
    queryFn: () => api.formulas.list(projectId),
    staleTime: 30_000,
  });
  React.useEffect(() => {
    if (query.error) toastError(query.error);
  }, [query.error]);
  return query;
}

export function useFormula(projectId: string, name: string | null) {
  const query = useQuery({
    queryKey: formulaKey(projectId, name ?? ""),
    queryFn: () => api.formulas.show(projectId, name ?? ""),
    enabled: !!name,
  });
  React.useEffect(() => {
    if (query.error) toastError(query.error);
  }, [query.error]);
  return query;
}

export function usePourFormula(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      vars?: Record<string, string>;
      phase: PourPhase;
      dryRun?: boolean;
    }) =>
      api.formulas.pour(projectId, input.name, {
        vars: input.vars,
        phase: input.phase,
        dryRun: input.dryRun,
      }),
    onError: (err: unknown) => toastError(err),
    onSuccess: (res, vars) => {
      if (vars.dryRun) return;
      qc.invalidateQueries({ queryKey: beadsKey(projectId) });
      const verb = vars.phase === "wisp" ? "Wisped" : "Poured";
      toast.success(
        res.new_epic_id ? `${verb} ${vars.name} → ${res.new_epic_id}` : `${verb} ${vars.name}`,
      );
    },
  });
}
