"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Icon } from "@/components/icons";
import { useUpdateCheck } from "@/hooks/use-update-check";
import { api } from "@/lib/api-client";
import type { UpdateStatus } from "@/lib/update-types";
import { commitUrl } from "@/lib/build-info";

export function UpdateIndicator() {
  const { data } = useUpdateCheck();
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<UpdateStatus | null>(null);
  const run = useMutation({
    mutationFn: () => {
      if (!selected?.target) throw new Error("Check for updates again.");
      return api.selfUpdate.run(selected.target);
    },
    onSuccess: () => {
      if (selected) qc.setQueryData<UpdateStatus>(["update-check", selected.channel], prev => prev ? { ...prev, updateAvailable: false } : prev);
    },
  });
  if (!data?.updateAvailable && !selected) return null;
  const label = data?.channel === "stable" ? `Version ${data.latestVersion} available` : "Development update available";
  return <>
    {data?.updateAvailable && <button onClick={() => { run.reset(); setSelected(data); }}
      className="flex items-center gap-[6px] rounded-lg border px-[9px] py-[5px] text-[11px] font-semibold"
      style={{ borderColor: "var(--brand)", color: "var(--brand)", background: "var(--brand-weak)" }}>
      <Icon name="rocket" size={12} /><span>{label}</span>
    </button>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !run.isPending) setSelected(null); }}>
      {selected && <DialogContent className="max-w-[480px]">
        <DialogTitle>{selected.channel === "stable" ? `Version ${selected.latestVersion} available` : "Development update available"}</DialogTitle>
        <DialogDescription>
          {selected.channel === "stable" ? `You are running version ${selected.currentVersion}. This update installs version ${selected.latestVersion}.` :
            `There are ${selected.behind} newer commits on main. This update installs the selected development build.`}
        </DialogDescription>
        <a href={selected.releaseUrl || commitUrl(selected.remoteSha)} target="_blank" rel="noopener noreferrer"
          className="text-[13px] text-[var(--brand)] underline">
          {selected.channel === "stable" ? "Release notes and update instructions" : "View selected development build"}
        </a>
        {!selected.canUpdate && <p className="text-[13px] leading-relaxed">{selected.manualReason || "Follow the release instructions to update this installation."}</p>}
        {selected.canUpdate && !run.data && <p className="text-[12px] leading-relaxed text-[var(--text-3)]">
          Update now installs the selected source version, restores its dependencies, and builds the app.
          {selected.supervised ? " The server then restarts automatically." : " Restart the server manually afterward to load the new version."}
        </p>}
        {run.isError && <p role="alert" className="rounded-lg border border-red-400 p-3 text-[12px]">{run.error.message}</p>}
        {run.data && <div className="space-y-2 text-[12px]">
          {run.data.steps.map(step => <div key={step.name}>✓ {step.name}</div>)}
          <p>{run.data.restarting ? "The server is restarting. This page will reconnect shortly." : "Update built successfully. Restart the server to load the new version."}</p>
        </div>}
        <div className="mt-2 flex justify-end gap-2">
          <button disabled={run.isPending} onClick={() => setSelected(null)} className="rounded-lg border border-border px-3 py-2 text-[12px] disabled:opacity-50">{run.data ? "Close" : "Not now"}</button>
          {selected.canUpdate && selected.target && !run.data && <button disabled={run.isPending} onClick={() => run.mutate()}
            className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--brand)" }}>
            {run.isPending ? "Updating…" : "Update now"}
          </button>}
        </div>
      </DialogContent>}
    </Dialog>
  </>;
}
