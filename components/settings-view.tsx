"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme-provider";
import { api, type DoctorResponse } from "@/lib/api-client";

const inputClass =
  "h-[38px] rounded-[9px] border border-border bg-[var(--surface-2)] px-3 text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--brand)]";

export function SettingsView() {
  const { data } = useQuery({ queryKey: ["doctor"], queryFn: api.doctor });
  const key = data?.config
    ? `${data.config.repoPath}|${data.config.humanActor}|${data.config.humanAllowlist.join(",")}`
    : "loading";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex-shrink-0 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Settings</h1>
        <span className="text-[11.5px] text-[var(--text-3)]">
          Local config · stored under the OS config dir, not in beads
        </span>
      </header>
      <div className="bd-scroll min-h-0 flex-1 overflow-y-auto p-[24px_22px]">
        {data ? <SettingsForm key={key} data={data} /> : <div className="text-[13px] text-[var(--text-3)]">Loading…</div>}
      </div>
    </div>
  );
}

function SettingsForm({ data }: { data: DoctorResponse }) {
  const { theme, toggle } = useTheme();
  const qc = useQueryClient();
  const [repoPath, setRepoPath] = React.useState(data.config.repoPath);
  const [actor, setActor] = React.useState(data.config.humanActor);
  const [allowlist, setAllowlist] = React.useState<string[]>(data.config.humanAllowlist);
  const [newName, setNewName] = React.useState("");
  const [demo, setDemo] = React.useState(data.config.demo);

  const save = useMutation({
    mutationFn: () => api.saveConfig({ repoPath, humanActor: actor, humanAllowlist: allowlist, demo }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["doctor"] });
      qc.invalidateQueries({ queryKey: ["beads"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto flex max-w-[620px] flex-col gap-[18px]">
      <Card title="Repository">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] text-[var(--text-2)]">.beads repo path</span>
          <input className={`${inputClass} font-mono`} value={repoPath} onChange={(e) => setRepoPath(e.target.value)} />
        </label>
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-2)]">
          <Icon name={data.ok ? "check" : "x"} size={14} style={{ color: data.ok ? "#22c55e" : "#ef4444" }} />
          <span>
            {data.kind === "demo"
              ? "Demo mode — in-memory sample data. Install bd + point at a .beads repo for live data."
              : `${data.message}${data.version ? ` · ${data.version}` : ""}`}
          </span>
        </div>
      </Card>

      <Card title="Attribution">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] text-[var(--text-2)]">
            Human actor (stamps <span className="font-mono">BEADS_ACTOR</span>)
          </span>
          <input className={inputClass} value={actor} onChange={(e) => setActor(e.target.value)} />
        </label>
        <div className="flex flex-col gap-[7px]">
          <span className="text-[12px] text-[var(--text-2)]">Human allowlist · others render as agent</span>
          <div className="flex flex-wrap gap-[7px]">
            {allowlist.map((n) => (
              <span
                key={n}
                className="inline-flex items-center gap-[6px] rounded-lg border border-border bg-[var(--surface-2)] px-[9px] py-1 text-[12px]"
              >
                {n}
                <button
                  onClick={() => setAllowlist((a) => a.filter((x) => x !== n))}
                  className="cursor-pointer text-[var(--text-3)] hover:text-[#ef4444]"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  setAllowlist((a) => Array.from(new Set([...a, newName.trim()])));
                  setNewName("");
                }
              }}
              placeholder="+ add name, Enter"
              className="w-[120px] rounded-lg border border-dashed border-[var(--border-strong)] bg-transparent px-[9px] py-1 text-[12px] text-[var(--text)] outline-none"
            />
          </div>
        </div>
      </Card>

      <Card title="Data source">
        <div className="flex items-center justify-between">
          <div className="pr-4">
            <div className="text-[13px]">Demo mode</div>
            <div className="text-[11.5px] text-[var(--text-3)]">
              Use the built-in sample dataset instead of <span className="font-mono">bd</span>.
              Also forced by the <span className="font-mono">BEADS_DEMO=1</span> env var. Save to
              apply.
            </div>
          </div>
          <Switch checked={demo} onCheckedChange={setDemo} />
        </div>
        <div className="text-[11.5px] text-[var(--text-2)]">
          Currently serving:{" "}
          <span className="font-mono">{data.kind === "demo" ? "demo (in-memory)" : "bd (live)"}</span>
        </div>
      </Card>

      <Card title="Freshness & theme">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px]">Poll interval</div>
            <div className="text-[11.5px] text-[var(--text-3)]">TanStack Query background refetch</div>
          </div>
          <span className="rounded-lg border border-border bg-[var(--surface-2)] px-[10px] py-1 font-mono text-[13px] text-[var(--text-2)]">
            {Math.round(data.config.pollIntervalMs / 1000)}s
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px]">Theme</div>
            <div className="text-[11.5px] text-[var(--text-3)]">Currently {theme}</div>
          </div>
          <button
            onClick={toggle}
            className="flex h-[34px] items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[13px] text-[12.5px] hover:bg-[var(--surface-3)]"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
            <span>Switch theme</span>
          </button>
        </div>
      </Card>

      <div className="flex justify-end">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex h-[38px] items-center gap-[7px] rounded-[9px] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          <Icon name="check" size={15} />
          Save settings
        </button>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[14px] rounded-[13px] border border-border bg-[var(--surface)] p-[18px_20px]">
      <div className="text-[13.5px] font-semibold">{title}</div>
      {children}
    </section>
  );
}
