"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useBoardPrefs } from "@/hooks/use-board-prefs";

/**
 * Polls /api/update/check for a newer main commit (bead bgb). Disabled when the
 * user turns off update checks in Settings. Cheap and silent — failures (offline,
 * not a git repo) just yield no indicator.
 */
export function useUpdateCheck() {
  const { prefs } = useBoardPrefs();
  return useQuery({
    queryKey: ["update-check"],
    queryFn: async () => {
      const status = await api.selfUpdate.check();
      // A transient check failure (offline, fetch error) comes back as a 200 with
      // behind:0 + an error message. Throwing keeps react-query's last-known data
      // instead of clobbering a real "Update available" with behind:0.
      if (status.isGitRepo && status.error) throw new Error(status.error);
      return status;
    },
    enabled: prefs.checkUpdates,
    refetchInterval: 5 * 60_000,
    // Each check runs a server-side `git fetch` (network); the 5-minute interval is
    // enough — don't fire a fresh fetch on every window focus.
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    retry: false,
  });
}
