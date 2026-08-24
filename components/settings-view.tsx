"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { useTheme } from "@/components/theme-provider";
import { THEMES } from "@/lib/themes";
import { useApp } from "@/components/app-context";
import { api, type DoctorResponse } from "@/lib/api-client";
import { useNotificationPrefs, type NotifPrefs } from "@/hooks/use-notifications";
import { useBoardPrefs } from "@/hooks/use-board-prefs";
import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  isAiProvider,
  type AiProvider,
} from "@/lib/ai-providers";

const inputClass =
  "h-[38px] rounded-[9px] border border-border bg-[var(--surface-2)] px-3 text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--brand)]";

export function SettingsView() {
  const { projectId } = useApp();
  const { data } = useQuery({
    queryKey: ["doctor", projectId],
    queryFn: () => api.doctor(projectId),
  });
  const key = data?.config
    ? `${data.repoPath}|${data.config.humanActor}|${data.config.humanAllowlist.join(",")}|${data.config.aiProvider ?? ""}`
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
        {data ? (
          <SettingsForm key={key} data={data} />
        ) : (
          <div className="text-[13px] text-[var(--text-3)]">Loading…</div>
        )}
      </div>
    </div>
  );
}

function SettingsForm({ data }: { data: DoctorResponse }) {
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const [actor, setActor] = React.useState(data.config.humanActor);
  const [allowlist, setAllowlist] = React.useState<string[]>(data.config.humanAllowlist);
  const [newName, setNewName] = React.useState("");
  // Fallback poll interval, edited in seconds. Clamped to the config API's
  // accepted range (1–300s = 1000–300000ms) before saving; falls back to the
  // current value when the field is left blank or non-numeric.
  const [pollSec, setPollSec] = React.useState(String(Math.round(data.config.pollIntervalMs / 1000)));
  const [provider, setProvider] = React.useState<AiProvider>(
    isAiProvider(data.config.aiProvider) ? data.config.aiProvider : DEFAULT_AI_PROVIDER,
  );
  const clampSec = (s: string) => {
    const n = Math.round(Number(s));
    return Number.isFinite(n) && n > 0
      ? Math.min(300, Math.max(1, n))
      : Math.round(data.config.pollIntervalMs / 1000);
  };

  const save = useMutation({
    mutationFn: () =>
      api.saveConfig({
        humanActor: actor,
        humanAllowlist: allowlist,
        pollIntervalMs: clampSec(pollSec) * 1000,
        aiProvider: provider,
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      // Re-fetch beads so useBeads picks up the new meta.pollIntervalMs and
      // reschedules its fallback poll immediately (TanStack re-reads the
      // functional refetchInterval after each fetch).
      qc.invalidateQueries({ queryKey: ["doctor"] });
      qc.invalidateQueries({ queryKey: ["beads"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const isDemo = data.kind === "demo";

  return (
    <div className="mx-auto flex max-w-[620px] flex-col gap-[18px]">
      <Card title="Project">
        <div className="flex flex-col gap-[6px]">
          <span className="text-[12px] text-[var(--text-2)]">{data.project?.name ?? "—"}</span>
          <span className="break-all font-mono text-[12px] text-[var(--text-3)]">
            {isDemo ? "built-in sample data (no path)" : data.repoPath}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-2)]">
          <Icon
            name={data.ok ? "check" : "x"}
            size={14}
            style={{ color: data.ok ? "#22c55e" : "#ef4444" }}
          />
          <span>
            {isDemo
              ? "Demo mode — in-memory sample data. Add a real project to manage live beads."
              : `${data.message}${data.version ? ` · ${data.version}` : ""}`}
          </span>
        </div>
        <div className="text-[11.5px] text-[var(--text-3)]">
          Switch or add projects from the project menu in the sidebar.
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
          <span className="text-[12px] text-[var(--text-2)]">
            Human allowlist · others render as agent
          </span>
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
        <div className="text-[11.5px] text-[var(--text-3)]">
          Attribution is global — it applies to every project.
        </div>
      </Card>

      <Card title="AI">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] text-[var(--text-2)]">Refine with AI provider</span>
          <select
            aria-label="AI provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiProvider)}
            className={inputClass}
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <div className="text-[11.5px] text-[var(--text-3)]">
          Shells out to a CLI already installed and logged in on this machine.
          Override the binary with <span className="font-mono">OPENCODE_BIN</span>,{" "}
          <span className="font-mono">CLAUDE_BIN</span>,{" "}
          <span className="font-mono">CURSOR_BIN</span> (Cursor CLI is{" "}
          <span className="font-mono">agent</span>), or{" "}
          <span className="font-mono">CODEX_BIN</span>. None of the CLIs are bundled.
        </div>
      </Card>

      <Card title="Freshness & theme">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px]">Fallback refresh interval</div>
            <div className="text-[11.5px] text-[var(--text-3)]">
              Live changes stream in instantly; this only backstops a dropped stream
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-[6px]">
            <input
              type="number"
              min={1}
              max={300}
              value={pollSec}
              onChange={(e) => setPollSec(e.target.value)}
              onBlur={() => setPollSec(String(clampSec(pollSec)))}
              aria-label="Fallback refresh interval in seconds"
              className={`${inputClass} w-[72px] text-right font-mono`}
            />
            <span className="font-mono text-[13px] text-[var(--text-3)]">s</span>
          </div>
        </div>
        <div className="flex flex-col gap-[10px]">
          <div>
            <div className="text-[13px]">Theme</div>
            <div className="text-[11.5px] text-[var(--text-3)]">
              Saved per project — each project remembers its own theme on this device.
              Currently <span className="font-[550] text-[var(--text-2)]">{theme.name}</span>.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3">
            {THEMES.map((t) => {
              const active = t.id === theme.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className="flex items-center gap-[9px] rounded-[10px] border p-[9px] text-left transition-colors hover:bg-[var(--surface-3)]"
                  style={{
                    background: "var(--surface-2)",
                    borderColor: active ? "var(--brand)" : "var(--border)",
                    boxShadow: active ? "0 0 0 1px var(--brand)" : "none",
                  }}
                >
                  <span className="flex h-[24px] w-[24px] flex-shrink-0 overflow-hidden rounded-[7px] border border-border">
                    {t.swatch.map((c, i) => (
                      <span key={i} style={{ background: c, width: "33.34%" }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-[550] text-[var(--text)]">
                      {t.name}
                    </span>
                    <span className="block text-[10.5px] capitalize text-[var(--text-3)]">
                      {t.mode}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <BoardCard />

      <UpdatesCard />

      <NotificationsCard />

      <GamificationCard />

      <Card title="Keyboard shortcuts">
        <div className="flex flex-col gap-[10px]">
          {[
            { keys: ["⌘", "K"], label: "Open the command palette" },
            { keys: ["N"], label: "Create a new bead" },
            { keys: ["/"], label: "Focus the search box" },
            { keys: ["T"], label: "Toggle light / dark theme" },
            { keys: ["Esc"], label: "Close the open drawer or dialog" },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-[13px] text-[var(--text-2)]">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded-md border border-border bg-[var(--surface-2)] px-[8px] py-[3px] font-mono text-[12px] text-[var(--text-2)] shadow-[var(--shadow)]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="text-[11.5px] text-[var(--text-3)]">
          Shortcuts are disabled while typing in a field.
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

function BoardCard() {
  const { prefs, setPrefs } = useBoardPrefs();
  const opts: { value: "auto" | "always"; label: string }[] = [
    { value: "auto", label: "Only when it has beads" },
    { value: "always", label: "Always show" },
  ];
  return (
    <Card title="Board">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[13px]">Blocked column</div>
          <div className="text-[11.5px] text-[var(--text-3)]">
            Hide the Blocked column when nothing is blocked, or keep it pinned.
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-1 rounded-[9px] border border-border bg-[var(--surface-2)] p-1">
          {opts.map((o) => {
            const active = prefs.blockedColumn === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setPrefs({ ...prefs, blockedColumn: o.value })}
                className="rounded-[7px] px-[11px] py-[6px] text-[12px] font-[550] transition-colors"
                style={{
                  background: active ? "var(--brand)" : "transparent",
                  color: active ? "#fff" : "var(--text-2)",
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function UpdatesCard() {
  const { prefs, setPrefs } = useBoardPrefs();
  const on = prefs.checkUpdates;
  return (
    <Card title="Software updates">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[13px]">Check for new versions</div>
          <div className="text-[11.5px] text-[var(--text-3)]">
            When running from the app’s git clone, check GitHub for newer commits on{" "}
            <span className="font-mono">main</span> and show an update indicator in the sidebar.
            Per-device.
          </div>
        </div>
        <button
          onClick={() => setPrefs({ ...prefs, checkUpdates: !on })}
          className="flex h-[34px] flex-shrink-0 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[13px] text-[12.5px] hover:bg-[var(--surface-3)]"
        >
          <Icon name={on ? "check" : "x"} size={14} />
          <span>{on ? "Enabled" : "Disabled"}</span>
        </button>
      </div>
    </Card>
  );
}

function GamificationCard() {
  const { meta } = useApp();
  const qc = useQueryClient();
  const enabled = !!meta?.gamification;
  const save = useMutation({
    mutationFn: (v: boolean) => api.saveConfig({ gamification: v }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["beads"] });
      qc.invalidateQueries({ queryKey: ["doctor"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Card title="Gamification">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px]">Productivity XP &amp; levels</div>
          <div className="text-[11.5px] text-[var(--text-3)]">
            Earn XP for closing beads (weighted by priority and how many they unblock);
            a level/progress bar appears in the sidebar. Derived from bd history — opt-in.
          </div>
        </div>
        <button
          onClick={() => save.mutate(!enabled)}
          disabled={save.isPending}
          className="flex h-[34px] items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[13px] text-[12.5px] hover:bg-[var(--surface-3)] disabled:opacity-50"
        >
          <Icon name={enabled ? "check" : "x"} size={14} />
          <span>{enabled ? "Enabled" : "Disabled"}</span>
        </button>
      </div>
    </Card>
  );
}

function NotificationsCard() {
  const { prefs, setPrefs, permission, requestPermission } = useNotificationPrefs();
  const unsupported = permission === "unsupported";

  const toggleEnabled = async () => {
    if (!prefs.enabled) {
      // Turning on: ask for OS permission (a no-op if already granted/denied).
      if (permission === "default") await requestPermission();
    }
    setPrefs({ ...prefs, enabled: !prefs.enabled });
  };

  const cat = (key: keyof NotifPrefs, label: string) => (
    <label className="flex cursor-pointer select-none items-center gap-[9px]">
      <input
        type="checkbox"
        checked={prefs[key]}
        disabled={!prefs.enabled}
        onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
        className="h-4 w-4 cursor-pointer disabled:opacity-40"
        style={{ accentColor: "var(--brand)" }}
      />
      <span className={`text-[13px] ${prefs.enabled ? "text-[var(--text-2)]" : "text-[var(--text-3)]"}`}>
        {label}
      </span>
    </label>
  );

  return (
    <Card title="Notifications">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px]">Desktop &amp; toast notifications</div>
          <div className="text-[11.5px] text-[var(--text-3)]">
            {unsupported
              ? "This browser does not support desktop notifications."
              : "Get notified when an agent finishes or blocks a bead, or escalates one to you."}
          </div>
        </div>
        <button
          onClick={toggleEnabled}
          disabled={unsupported}
          className="flex h-[34px] items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[13px] text-[12.5px] hover:bg-[var(--surface-3)] disabled:opacity-50"
        >
          <Icon name={prefs.enabled ? "check" : "x"} size={14} />
          <span>{prefs.enabled ? "Enabled" : "Disabled"}</span>
        </button>
      </div>
      {prefs.enabled && permission === "denied" && (
        <div className="text-[11.5px] text-[#ef4444]">
          Desktop permission is blocked in your browser — you will still see in-app toasts.
          Re-enable notifications for this site in your browser settings for desktop alerts.
        </div>
      )}
      <div className="flex flex-col gap-[8px]">
        {cat("finished", "An agent finishes a bead")}
        {cat("blocked", "A bead becomes blocked")}
        {cat("escalation", "A bead is escalated to you (Needs You)")}
      </div>
      <div className="text-[11.5px] text-[var(--text-3)]">
        Per-device — stored in this browser, not in beads. Your own (human) actions never notify.
      </div>
    </Card>
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
