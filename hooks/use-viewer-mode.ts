"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

const KEY = ["viewer-mode"];
const CHANNEL = "scotty-viewer-mode";

export function useViewerMode() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: api.viewerMode, refetchInterval: 5000 });
  React.useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => { void qc.invalidateQueries({ queryKey: KEY }); };
    return () => channel.close();
  }, [qc]);
  const change = useMutation({
    mutationFn: api.setViewerMode,
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
      void qc.invalidateQueries({ queryKey: ["beads"] });
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(CHANNEL);
        channel.postMessage("changed");
        channel.close();
      }
    },
  });
  return { ...query, change };
}
