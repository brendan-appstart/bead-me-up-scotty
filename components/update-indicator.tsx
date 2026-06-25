"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Icon } from "@/components/icons";
import { useUpdateCheck } from "@/hooks/use-update-check";
import { api, type UpdateStatus, type UpdateResult } from "@/lib/api-client";
import { commitUrl } from "@/lib/build-info";

/**
 * "Update available" indicator for the sidebar footer (bead bgb). Shows only when
 * the app's clone is behind origin/main. Clicking opens a modal that explains
 * what's new and runs a one-click update (git pull → build → relaunch).
 */
export function UpdateIndicator() {
  const { data } = useUpdateCheck();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const run = useMutation<UpdateResult>({
    mutationFn: () => api.selfUpdate.run(),
    onSuccess: (r) => {
      // The build advanced HEAD to r.toSha — reflect that immediately so the
      // sidebar badge clears instead of showing the now-current build as behind
      // until the next poll (which fails anyway while the server restarts).
      qc.setQueryData<UpdateStatus>(["update-check"], (prev) =>
        prev ? { ...prev, behind: 0, localSha: r.toSha } : prev,
      );
    },
  });

  if (!data?.isGitRepo || data.behind <= 0) return null;

  const plural = data.behind === 1 ? "commit" : "commits";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="A newer version is available"
        className="flex items-center gap-[6px] rounded-[8px] border px-[9px] py-[5px] text-[11px] font-[600] transition-colors"
        style={{ borderColor: "var(--brand)", color: "var(--brand)", background: "var(--brand-weak)" }}
      >
        <Icon name="rocket" size={12} />
        <span>Update available{data.behind > 1 ? ` · ${data.behind}` : ""}</span>
      </button>

      <Dialog open={open} onOpenChange={(o) => !run.isPending && setOpen(o)}>
        <DialogContent className="max-w-[460px]">
          <DialogTitle>Update available</DialogTitle>
          <DialogDescription>
            Your build is {data.behind} {plural} behind <span className="font-mono">main</span>.
          </DialogDescription>

          <div className="mt-1 flex items-center gap-2 rounded-[9px] border border-border bg-[var(--surface-2)] p-[10px_12px] font-mono text-[12px]">
            <span className="text-[var(--text-3)]">{data.localSha || "current"}</span>
            <Icon name="chevron" size={13} className="text-[var(--text-3)]" />
            <a
              href={commitUrl(data.remoteSha)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--brand)] hover:underline"
            >
              {data.remoteSha}
            </a>
            <span className="flex-1" />
            <span className="text-[var(--text-3)]">latest on GitHub</span>
          </div>

          {!run.data && !run.isError && (
            <p className="text-[12px] leading-[1.5] text-[var(--text-3)]">
              Update now runs <span className="font-mono">git pull</span> → install (if deps changed) →{" "}
              <span className="font-mono">build</span>
              {data.supervised
                ? ", then restarts the server automatically."
                : ". The server is not running under the supervisor (npm run serve), so you'll need to restart it manually afterward."}
            </p>
          )}

          {run.isError && (
            <div className="rounded-[9px] border border-[#ef4444]/40 bg-[#ef4444]/5 p-[10px_12px] text-[12px] text-[#ef4444]">
              {(run.error as Error).message}
            </div>
          )}

          {run.data && (
            <div className="flex flex-col gap-[6px]">
              {run.data.steps.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-[12px]">
                  <Icon name={s.ok ? "check" : "x"} size={13} style={{ color: s.ok ? "#22c55e" : "#ef4444" }} />
                  <span className="font-[550]">{s.name}</span>
                </div>
              ))}
              <div className="mt-1 text-[12px] text-[var(--text-2)]">
                {run.data.restarting
                  ? `Updated to ${run.data.toSha} — the server is restarting; this page will reconnect shortly.`
                  : `Built ${run.data.toSha}. Restart the server to load the new version.`}
              </div>
            </div>
          )}

          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              disabled={run.isPending}
              className="h-9 rounded-lg border border-border bg-[var(--surface-2)] px-3 text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-50"
            >
              {run.data ? "Close" : "Not now"}
            </button>
            {!run.data && (
              <button
                onClick={() => run.mutate()}
                disabled={run.isPending}
                className="flex h-9 items-center gap-[7px] rounded-lg px-3 text-[12.5px] font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--brand)" }}
              >
                <Icon name="rocket" size={14} />
                {run.isPending ? "Updating…" : "Update now"}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
