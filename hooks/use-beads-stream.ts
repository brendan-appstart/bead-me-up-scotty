"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { beadsKey } from "@/hooks/use-beads";

/**
 * Subscribe to the server's SSE change stream for a project and refetch the
 * beads query whenever the project's `.beads/` directory mutates. This is the
 * fast path; `useBeads`'s interval is just a fallback.
 *
 * Returns whether the stream is currently connected (for an optional "Live"
 * indicator). The demo project has no filesystem to watch, so it never connects.
 */
export function useBeadsStream(projectId: string): { live: boolean } {
  const qc = useQueryClient();
  const [live, setLive] = React.useState(false);

  React.useEffect(() => {
    if (projectId === "demo") return; // demo has no .beads to watch

    const es = new EventSource(
      `/api/p/${encodeURIComponent(projectId)}/beads/stream`,
    );
    es.addEventListener("open", () => setLive(true));
    es.addEventListener("error", () => setLive(false)); // EventSource auto-reconnects
    es.addEventListener("change", () => {
      qc.invalidateQueries({ queryKey: beadsKey(projectId) });
    });

    return () => {
      setLive(false);
      es.close();
    };
  }, [projectId, qc]);

  return { live };
}
