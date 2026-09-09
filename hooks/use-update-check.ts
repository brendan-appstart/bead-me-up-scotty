"use client";
import { useQuery } from "@tanstack/react-query";
import { useBoardPrefs } from "@/hooks/use-board-prefs";
import { api } from "@/lib/api-client";
export function useUpdateCheck() {
  const { prefs, ready } = useBoardPrefs();
  const query = useQuery({
    queryKey: ["update-check", prefs.updateChannel],
    queryFn: async () => {
      const status = await api.selfUpdate.check(prefs.updateChannel);
      if (status.error) throw new Error(status.error);
      return status;
    },
    enabled: ready && prefs.checkUpdates,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    retry: false,
  });
  return { ...query, data: ready && prefs.checkUpdates ? query.data : undefined };
}
