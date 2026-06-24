"use client";
import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { useApp } from "@/components/app-context";
import { useInsights } from "@/hooks/use-beads";
import type { InsightsData } from "@/lib/api-client";

const HUMAN = "#3b82f6";
const AGENT = "#8b5cf6";
const RANGES = [7, 30, 90];
const WIP_KEY = "bmus.wipLimits";
// Only columns where a work-in-progress limit is meaningful.
const WIP_COLUMNS = ["ready", "in_progress", "blocked"];

function loadWip(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(WIP_KEY) || "{}");
  } catch {
    return {};
  }
}

const shortDate = (d: string) => d.slice(5); // YYYY-MM-DD → MM-DD
const hrs = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)}d` : `${h.toFixed(1)}h`);

export function InsightsView() {
  const { projectId } = useApp();
  const [days, setDays] = React.useState(30);
  const [split, setSplit] = React.useState(true);
  const { data, isLoading } = useInsights(projectId, days);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="text-[15px] font-[650]">Insights</h1>
        <span className="text-[12px] text-[var(--text-3)]">· flow metrics, human vs agent</span>
        <span className="flex-1" />
        <label className="flex items-center gap-[6px] text-[12px] text-[var(--text-2)]">
          <input
            type="checkbox"
            checked={split}
            onChange={(e) => setSplit(e.target.checked)}
            style={{ accentColor: "var(--brand)" }}
          />
          Split by human/agent
        </label>
        <div className="flex overflow-hidden rounded-[8px] border border-border">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`px-[10px] py-[5px] text-[12px] ${
                days === r ? "bg-[var(--brand)] text-white" : "bg-[var(--surface-2)] text-[var(--text-2)]"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {isLoading && !data ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-3)]">Loading insights…</div>
        ) : !data ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-3)]">No data.</div>
        ) : (
          <Dashboard data={data} split={split} />
        )}
      </div>
    </div>
  );
}

function Dashboard({ data, split }: { data: InsightsData; split: boolean }) {
  // Insights is reached via client-side view switching (never SSR'd), so reading
  // localStorage in the lazy initializer is safe and avoids a setState-in-effect.
  const [wip, setWip] = React.useState<Record<string, number>>(() => loadWip());
  const setLimit = (id: string, v: number) => {
    const next = { ...wip, [id]: v };
    setWip(next);
    if (typeof window !== "undefined") localStorage.setItem(WIP_KEY, JSON.stringify(next));
  };

  const totalClosed = data.throughput.reduce((s, p) => s + p.total, 0);
  const inProgress = data.columns.find((c) => c.id === "in_progress")?.count ?? 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={`Closed (last ${data.days}d)`} value={String(totalClosed)} />
        <Kpi label="Cycle p50" value={data.cycle.overall.count ? hrs(data.cycle.overall.p50) : "—"} />
        <Kpi label="Cycle p90" value={data.cycle.overall.count ? hrs(data.cycle.overall.p90) : "—"} />
        <Kpi label="In progress" value={String(inProgress)} />
      </div>

      {!data.hasEvents && (
        <div className="rounded-[8px] border border-border bg-[var(--surface-2)] px-3 py-2 text-[12px] text-[var(--text-3)]">
          No interaction log found for this project — metrics are derived from bead
          created/closed timestamps (best effort).
        </div>
      )}

      <Panel title={`Throughput · closed per day${split ? " (human vs agent)" : ""}`}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.throughput} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} stroke="var(--text-3)" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--text-3)" />
            <Tooltip
              contentStyle={{ fontSize: 12, background: "var(--surface)", border: "1px solid var(--border)" }}
              labelFormatter={shortDate}
            />
            {split ? (
              <>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="human" stackId="a" fill={HUMAN} name="Human" radius={[0, 0, 0, 0]} />
                <Bar dataKey="agent" stackId="a" fill={AGENT} name="Agent" radius={[3, 3, 0, 0]} />
              </>
            ) : (
              <Bar dataKey="total" fill="var(--brand)" name="Closed" radius={[3, 3, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Created vs closed">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.createdClosed} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} stroke="var(--text-3)" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--text-3)" />
            <Tooltip
              contentStyle={{ fontSize: 12, background: "var(--surface)", border: "1px solid var(--border)" }}
              labelFormatter={shortDate}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="created" stroke="#64748b" strokeWidth={2} dot={false} name="Created" />
            <Line type="monotone" dataKey="closed" stroke="#16a34a" strokeWidth={2} dot={false} name="Closed" />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="Cycle time (in progress → closed)">
          <div className="flex flex-col gap-2">
            <CycleRow label="Overall" stat={data.cycle.overall} />
            <CycleRow label="👤 Human" stat={data.cycle.human} />
            <CycleRow label="🤖 Agent" stat={data.cycle.agent} />
          </div>
        </Panel>

        <Panel title="Aging work in progress">
          {data.aging.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-[var(--text-3)]">Nothing in progress.</div>
          ) : (
            <div className="flex flex-col gap-[6px]">
              {data.aging.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="font-mono text-[11px] text-[var(--text-3)]">{a.id}</span>
                  <span className="flex-1 truncate text-[var(--text-2)]">{a.title}</span>
                  <span
                    className="rounded-full px-[7px] py-px text-[11px] font-semibold"
                    style={{
                      color: a.days >= 7 ? "#ef4444" : "var(--text-2)",
                      background: a.days >= 7 ? "#ef444418" : "var(--surface-2)",
                    }}
                  >
                    {a.days}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Work-in-progress limits">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {data.columns
            .filter((c) => WIP_COLUMNS.includes(c.id))
            .map((c) => {
              const limit = wip[c.id] ?? 0;
              const over = limit > 0 && c.count > limit;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-[10px] border bg-[var(--surface-2)] p-3"
                  style={{ borderColor: over ? "#ef4444" : "var(--border)" }}
                >
                  <div>
                    <div className="flex items-center gap-[6px] text-[12.5px] font-[550]">
                      <span className="h-[8px] w-[8px] rounded-full" style={{ background: c.color }} />
                      {c.name}
                    </div>
                    <div
                      className="text-[18px] font-[650]"
                      style={{ color: over ? "#ef4444" : "var(--text)" }}
                    >
                      {c.count}
                      {over && <span className="ml-1 text-[11px] font-medium">over limit</span>}
                    </div>
                  </div>
                  <label className="flex flex-col items-end gap-[3px] text-[10.5px] text-[var(--text-3)]">
                    limit
                    <input
                      type="number"
                      min={0}
                      value={limit || ""}
                      placeholder="0"
                      onChange={(e) => setLimit(c.id, Math.max(0, Number(e.target.value) || 0))}
                      className="h-7 w-14 rounded-md border border-border bg-[var(--surface)] px-2 text-right text-[12px] text-[var(--text)] outline-none"
                    />
                  </label>
                </div>
              );
            })}
        </div>
        <div className="text-[11px] text-[var(--text-3)]">
          Limits are per-device (stored in this browser). 0 = no limit.
        </div>
      </Panel>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-[var(--surface)] p-4">
      <div className="text-[11px] uppercase tracking-[.03em] text-[var(--text-3)]">{label}</div>
      <div className="mt-1 text-[22px] font-[650] tracking-[-.02em]">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[13px] border border-border bg-[var(--surface)] p-[16px_18px]">
      <div className="text-[13px] font-semibold">{title}</div>
      {children}
    </section>
  );
}

function CycleRow({ label, stat }: { label: string; stat: { p50: number; p90: number; count: number } }) {
  return (
    <div className="flex items-center justify-between rounded-[9px] bg-[var(--surface-2)] px-3 py-2 text-[12.5px]">
      <span className="font-[550] text-[var(--text-2)]">{label}</span>
      {stat.count === 0 ? (
        <span className="text-[var(--text-3)]">no closed beads</span>
      ) : (
        <span className="flex items-center gap-3 font-mono text-[12px]">
          <span title="median">p50 {hrs(stat.p50)}</span>
          <span title="90th percentile" className="text-[var(--text-3)]">p90 {hrs(stat.p90)}</span>
          <span className="text-[var(--text-3)]">· {stat.count}</span>
        </span>
      )}
    </div>
  );
}
