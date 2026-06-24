import "server-only";
import type { Bead } from "../schema";
import { beadOrigin } from "../attribution";
import { statusLabel, childrenOf, initials, avatarColor } from "../beads-view";

/**
 * Delivery Report — a static, data-backed dashboard injected at the top of the
 * published showcase page. Reproduces design/publish-design/"Beads Report.dc.html"
 * (a reactive Claude-Design component) as plain server-rendered HTML + inline SVG
 * + a small vanilla-JS controller, so it works in the static file:// export.
 *
 * Every panel is driven by REAL bead data where it can be. Two dimensions can't
 * be derived from beads — story-point EFFORT (no such field) and epic GANTT spans
 * (no start/end dates) — so those panels are rendered with demo data and tagged
 * `data-demo`. The top-right toggle flips between "real data only" (demo panels
 * hidden) and "demo data" (everything shown). See bead 5m8.
 */

const DAY = 86_400_000;
const WEEKS = 8;

const ms = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const ICONS: Record<string, string> = {
  logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.3 6h7.4M6 8.3v7.4M18 8.3v7.4M8.3 18h7.4"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.6" y2="17.4"/><line x1="17.4" y1="6.6" x2="19.1" y2="4.9"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`,
  layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><polygon points="12 3 21 8 12 13 3 8 12 3"/><polyline points="3 13 12 18 21 13"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><polyline points="20 6 9 17 4 12"/></svg>`,
  spin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>`,
  block: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><polygon points="13 2 4 14 11 14 10 22 20 9 13 9 13 2"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  bot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><rect x="4" y="8" width="16" height="12" rx="3"/><line x1="12" y1="4" x2="12" y2="8"/><circle cx="12" cy="3" r="1.1" fill="currentColor"/><line x1="9" y1="13.5" x2="9" y2="15"/><line x1="15" y1="13.5" x2="15" y2="15"/><line x1="2" y1="13" x2="4" y2="13"/><line x1="20" y1="13" x2="22" y2="13"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13.5"/><line x1="12" y1="17" x2="12" y2="17"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="M12 2s5 4.5 5 9a5 5 0 0 1-10 0c0-1.6.8-3 1.5-4 .2 1.2 1 2 2 2 .3-3 1.5-5 1.5-7z"/></svg>`,
  timeline: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="17" y2="18"/></svg>`,
  burnup: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><polyline points="3 16 9 11 13 14 21 5"/><polyline points="15 5 21 5 21 11"/></svg>`,
  effort: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><circle cx="7" cy="14" r="3"/><circle cx="16" cy="8" r="4"/><circle cx="17" cy="17" r="2"/></svg>`,
  bars: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="9"/></svg>`,
};
const ic = (n: string, sz: number, color?: string) =>
  `<span style="display:inline-flex;width:${sz}px;height:${sz}px${color ? `;color:${color}` : ""}">${ICONS[n] ?? ""}</span>`;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// status → category color (scoped CSS vars defined under .dr)
function cat(s: string): "done" | "wip" | "blocked" | "frozen" | "ready" {
  if (s === "closed") return "done";
  if (s === "in_progress" || s === "hooked") return "wip";
  if (s === "blocked") return "blocked";
  if (s === "deferred") return "frozen";
  return "ready";
}
const CAT_COLOR: Record<string, string> = {
  done: "var(--green)",
  wip: "var(--amber)",
  blocked: "var(--red)",
  frozen: "var(--slate)",
  ready: "var(--blue)",
};
const catColor = (s: string) => CAT_COLOR[cat(s)];
const prioColor = (p: number) => ["var(--red)", "#f97316", "var(--amber)", "var(--blue)", "var(--slate)"][p] ?? "var(--slate)";
const FIB = [1, 2, 3, 5, 8];
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function weekLabels(now: number): string[] {
  const out: string[] = [];
  const start = now - WEEKS * 7 * DAY;
  for (let i = 0; i < WEEKS; i++) {
    const d = new Date(start + i * 7 * DAY);
    out.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  return out;
}
function weeklySeries(beads: Bead[], now: number) {
  const start = now - WEEKS * 7 * DAY;
  const bucket = (t: number) => Math.min(WEEKS - 1, Math.max(0, Math.floor((t - start) / (7 * DAY))));
  const created = Array(WEEKS).fill(0);
  const closed = Array(WEEKS).fill(0);
  for (const b of beads) {
    const c = ms(b.created_at);
    if (c !== null && c >= start && c <= now) created[bucket(c)]++;
    if (b.status === "closed") {
      const cl = ms(b.closed_at) ?? ms(b.updated_at);
      if (cl !== null && cl >= start && cl <= now) closed[bucket(cl)]++;
    }
  }
  const cum = (a: number[]) => a.reduce<number[]>((o, v) => (o.push((o[o.length - 1] ?? 0) + v), o), []);
  return { created, closed, createdCum: cum(created), closedCum: cum(closed), labels: weekLabels(now) };
}

// ─────────────────────────── sparklines ───────────────────────────
function spark(arr: number[], color: string): string {
  const max = Math.max(...arr, 1);
  return `<span class="dr-spk">${arr
    .map((v) => `<span style="background:${color};height:${Math.max(8, Math.round((v / max) * 100))}%"></span>`)
    .join("")}</span>`;
}

// ─────────────────────────── KPI row ───────────────────────────
function kpiRow(beads: Bead[], allow: string[], w: ReturnType<typeof weeklySeries>): string {
  const total = beads.length;
  const done = beads.filter((b) => b.status === "closed").length;
  const wip = beads.filter((b) => b.status === "in_progress" || b.status === "hooked").length;
  const blocked = beads.filter((b) => b.status === "blocked").length;
  const agent = beads.filter((b) => beadOrigin(b, allow) === "agent").length;
  const agentPct = total ? Math.round((agent / total) * 100) : 0;
  const donePct = total ? Math.round((done / total) * 100) : 0;
  const vel = w.closed.slice(-4).reduce((a, b) => a + b, 0) / 4;
  const thisWk = w.created[w.created.length - 1] ?? 0;

  const card = (
    label: string,
    icon: string,
    color: string,
    value: string | number,
    unit: string,
    sp: number[],
    delta: string,
    deltaColor: string,
  ) => `<div class="dr-kpi">
    <div class="dr-kpi-h"><span class="dr-kpi-ic" style="color:${color};background:color-mix(in srgb,${color} 14%,transparent)">${ic(icon, 14)}</span><span class="dr-kpi-l">${label}</span></div>
    <div class="dr-kpi-v"><span class="n">${value}</span><span class="u">${unit}</span></div>
    <div class="dr-kpi-f">${spark(sp, color)}<span class="d" style="color:${deltaColor}">${delta}</span></div>
  </div>`;

  return `<section class="dr-kpis">
    ${card("Total beads", "layers", "var(--accent)", total, "", w.created, `+${thisWk} this wk`, "var(--text-3)")}
    ${card("Completion", "check", "var(--green)", donePct, "%", w.closedCum, `${done}/${total}`, "var(--green)")}
    ${card("In progress", "spin", "var(--amber)", wip, "", w.closed, "active", "var(--text-3)")}
    ${card("Blocked", "block", "var(--red)", blocked, "", w.closed.map((_, i) => (i === WEEKS - 1 ? blocked : 0)), blocked ? "needs unblock" : "all clear", blocked ? "var(--red)" : "var(--green)")}
    ${card("Velocity", "bolt", "var(--blue)", vel.toFixed(1), "/wk", w.closed, "4-wk avg", "var(--text-3)")}
    ${card("Agent share", "bot", "var(--accent-2)", agentPct, "%", w.created, `${agent} beads`, "var(--text-3)")}
  </section>`;
}

// ─────────────────────────── main viz (tabbed) ───────────────────────────
function throughputSvg(w: ReturnType<typeof weeklySeries>): string {
  const T = 16, B = 234, L = 34, R = 668;
  const data = w.closed;
  const max = Math.max(...data, 1);
  const n = data.length;
  const slot = (R - L) / n;
  const bw = slot * 0.58;
  const y = (v: number) => B - (v / max) * (B - T);
  const avg = data.reduce((a, b) => a + b, 0) / n;
  const bars = data
    .map((v, i) => {
      const x = L + i * slot + (slot - bw) / 2;
      const yy = y(v);
      const fill = i >= n - 1 ? "var(--accent)" : "color-mix(in srgb,var(--accent) 78%,transparent)";
      return `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${(B - yy).toFixed(1)}" rx="4" fill="${fill}"><title>${w.labels[i]}: ${v} closed</title></rect><text x="${(x + bw / 2).toFixed(1)}" y="258" text-anchor="middle" font-size="10" fill="var(--text-3)">${w.labels[i]}</text>`;
    })
    .join("");
  const yTicks = [0, Math.ceil(max / 2), max]
    .map((v) => `<line x1="34" y1="${y(v).toFixed(1)}" x2="668" y2="${y(v).toFixed(1)}" stroke="var(--grid-line)"/><text x="28" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-3)">${v}</text>`)
    .join("");
  const best = Math.max(...data);
  const recent = data.slice(-2).reduce((a, b) => a + b, 0) / 2;
  const prior = data.slice(-4, -2).reduce((a, b) => a + b, 0) / 2;
  const diff = recent - prior;
  return `<div class="dr-viz-row"><svg viewBox="0 0 680 264" class="dr-svg">${yTicks}${bars}<line x1="34" y1="${y(avg).toFixed(1)}" x2="668" y2="${y(avg).toFixed(1)}" stroke="var(--amber)" stroke-width="1.6" stroke-dasharray="5 4"/><text x="664" y="${(y(avg) - 5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--amber)" font-weight="600">avg ${avg.toFixed(1)}/wk</text></svg>
    <div class="dr-viz-side">
      <div class="dr-leg"><span class="sw" style="background:var(--accent)"></span>Beads closed / week</div>
      <div class="dr-leg"><span class="ln" style="border-top:2px dashed var(--amber)"></span>Average velocity</div>
      <div class="dr-side-stats"><div><div class="bn">${best}</div><div class="bl">best week</div></div><div><div class="bn" style="color:${diff >= 0 ? "var(--green)" : "var(--red)"}">${diff >= 0 ? "+" : ""}${diff.toFixed(1)}</div><div class="bl">4-week momentum</div></div></div>
    </div></div>`;
}
function burnupSvg(w: ReturnType<typeof weeklySeries>): string {
  const T = 16, B = 234, L = 40, R = 668;
  const cc = w.createdCum, clc = w.closedCum;
  const total = Math.max(...cc, 1);
  const x = (i: number) => L + (i / (WEEKS - 1)) * (R - L);
  const y = (v: number) => B - (v / total) * (B - T);
  const lineP = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${lineP(clc)} L${x(WEEKS - 1).toFixed(1)} ${B} L${L} ${B} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const v = Math.round(total * f);
      return `<line x1="40" y1="${y(v).toFixed(1)}" x2="668" y2="${y(v).toFixed(1)}" stroke="var(--grid-line)"/><text x="34" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-3)">${v}</text>`;
    })
    .join("");
  const xTicks = w.labels.map((l, i) => `<text x="${x(i).toFixed(1)}" y="258" text-anchor="middle" font-size="10" fill="var(--text-3)">${l}</text>`).join("");
  const dots = clc.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.4" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>`).join("");
  const doneNow = clc[clc.length - 1] ?? 0;
  const vel = w.closed.slice(-4).reduce((a, b) => a + b, 0) / 4;
  const projWeeks = vel > 0 ? Math.ceil((total - doneNow) / vel) : "—";
  return `<div class="dr-viz-row"><svg viewBox="0 0 680 264" class="dr-svg">${yTicks}${xTicks}<line x1="40" y1="${y(total).toFixed(1)}" x2="668" y2="${y(total).toFixed(1)}" stroke="var(--text-3)" stroke-width="1.4" stroke-dasharray="5 4"/><text x="664" y="${(y(total) - 5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-3)">scope · ${total}</text><path d="${area}" fill="var(--accent)" opacity="0.12"/><path d="${lineP(cc)}" fill="none" stroke="var(--text-3)" stroke-width="2"/><path d="${lineP(clc)}" fill="none" stroke="var(--accent)" stroke-width="2.6"/>${dots}</svg>
    <div class="dr-viz-side">
      <div class="dr-leg"><span class="sw" style="background:var(--accent)"></span>Closed (cumulative)</div>
      <div class="dr-leg"><span class="sw" style="background:var(--text-3)"></span>Created (cumulative)</div>
      <div class="dr-leg"><span class="ln" style="border-top:2px dashed var(--text-3)"></span>Scope</div>
      <div class="dr-side-stats"><div><div class="bn">${projWeeks}</div><div class="bl">projected weeks to done</div></div><div><div class="bn" style="color:var(--accent)">${Math.round((doneNow / total) * 100)}%</div><div class="bl">scope completed</div></div></div>
    </div></div>`;
}
function ganttDemo(beads: Bead[]): string {
  // DEMO: epic % is real, but week spans are fabricated (beads has no start/end).
  const epics = beads.filter((b) => b.issue_type === "epic");
  const rows = epics.length
    ? epics
    : [
        { id: "demo-1", title: "Foundation", status: "closed" },
        { id: "demo-2", title: "Core features", status: "in_progress" },
        { id: "demo-3", title: "Polish & ship", status: "open" },
      ];
  const head = `<div class="dr-gantt-head"><div class="dr-gantt-label"></div><div class="dr-gantt-track">${weekLabels(Date.now())
    .map((l) => `<div class="dr-gantt-col">${l}</div>`)
    .join("")}</div></div>`;
  const bars = rows
    .map((e, i) => {
      const kids = epics.length ? childrenOf(e.id, beads) : [];
      const closed = kids.filter((k) => k.status === "closed").length;
      const pct = kids.length ? Math.round((closed / kids.length) * 100) : [100, 55, 10][i % 3];
      const span = Math.max(2, Math.round(WEEKS / Math.max(rows.length, 1)));
      const startW = Math.min(WEEKS - span, Math.round((i / Math.max(rows.length, 1)) * WEEKS));
      const left = (startW / WEEKS) * 100;
      const width = (span / WEEKS) * 100;
      const color = catColor(e.status);
      return `<div class="dr-gantt-row"><div class="dr-gantt-label"><span class="dot" style="background:${color}"></span><div><div class="t">${esc(e.title)}</div><div class="m">${kids.length || "demo"} beads</div></div></div><div class="dr-gantt-track">${weekLabels(Date.now()).map(() => `<div class="dr-gantt-cell"></div>`).join("")}<div class="dr-gantt-bar" style="left:${left}%;width:${width}%;background:color-mix(in srgb,${color} 22%,transparent);border:1px solid color-mix(in srgb,${color} 45%,transparent)"><div class="fill" style="width:${pct}%;background:${color}"></div><span class="pct" style="color:${pct > 22 ? "#fff" : "var(--text-2)"}">${pct}%</span></div></div></div>`;
    })
    .join("");
  return `<div class="dr-gantt">${head}${bars}</div>`;
}
function effortDemo(beads: Bead[]): string {
  // DEMO: positions tasks by REAL priority but fabricates effort (no points field).
  const T = 16, B = 234, L = 46, R = 668;
  const maxE = 13;
  const cx = (pr: number) => L + ((pr + 0.5) / 5) * (R - L);
  const y = (e: number) => B - (e / maxE) * (B - T);
  const tasks = beads.filter((b) => b.issue_type !== "epic");
  const bubbles = tasks
    .map((b) => {
      const h = hash(b.id);
      const effort = FIB[h % 5];
      const jit = ((h % 40) - 20) * 0.5;
      const c = catColor(b.status);
      return `<circle cx="${(cx(b.priority) + jit).toFixed(1)}" cy="${y(effort).toFixed(1)}" r="${(5 + effort * 1.5).toFixed(1)}" fill="${c}" fill-opacity="0.22" stroke="${c}" stroke-width="1.5"><title>${esc(b.id)} · ${esc(b.title)} · ${effort}p</title></circle>`;
    })
    .join("");
  const yTicks = [0, 4, 8, 12].map((v) => `<line x1="46" y1="${y(v).toFixed(1)}" x2="668" y2="${y(v).toFixed(1)}" stroke="var(--grid-line)"/><text x="40" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-3)">${v}</text>`).join("");
  const xCols = [0, 1, 2, 3, 4].map((pr) => `<text x="${cx(pr).toFixed(1)}" y="264" text-anchor="middle" font-size="10.5" fill="var(--text-3)" font-weight="600">P${pr}</text>`).join("");
  return `<div class="dr-viz-row"><svg viewBox="0 0 680 272" class="dr-svg">${yTicks}<text x="14" y="130" text-anchor="middle" font-size="10.5" fill="var(--text-3)" transform="rotate(-90 14 130)">effort (pts)</text>${xCols}${bubbles}</svg>
    <div class="dr-viz-side"><div class="dr-side-note">Bubble size = story-point effort. Beads has no effort field, so points are illustrative.</div></div></div>`;
}
function mainViz(beads: Bead[], w: ReturnType<typeof weeklySeries>, hasTime: boolean): string {
  const tab = (key: string, label: string, icon: string, demo: boolean) =>
    `<button class="dr-tab${demo ? " dr-tab-demo" : ""}" data-viz="${key}"${demo ? " data-demo" : ""}>${ic(icon, 14)}<span>${label}</span></button>`;
  const panel = (key: string, demo: boolean, body: string, title: string, sub: string) =>
    `<div class="dr-viz-panel" data-viz-panel="${key}"${demo ? " data-demo" : ""} style="display:none"><div class="dr-viz-cap"><b>${title}</b><span>${sub}</span></div>${body}</div>`;
  const realDemo = !hasTime; // no time series → throughput/burnup become demo too
  return `<section class="dr-card dr-main">
    <div class="dr-main-head"><div class="dr-main-tabs">
      ${tab("throughput", "Throughput", "bars", realDemo)}
      ${tab("burnup", "Burnup", "burnup", realDemo)}
      ${tab("timeline", "Timeline", "timeline", true)}
      ${tab("effort", "Effort", "effort", true)}
    </div></div>
    <div class="dr-main-body">
      ${panel("throughput", realDemo, throughputSvg(w), "Weekly throughput", "Beads closed per week vs rolling average")}
      ${panel("burnup", realDemo, burnupSvg(w), "Scope burnup", "Cumulative created vs closed against total scope")}
      ${panel("timeline", true, ganttDemo(beads), "Milestone timeline", "Epics across the project · fill = completion (spans illustrative)")}
      ${panel("effort", true, effortDemo(beads), "Effort landscape", "Every bead by priority · size = effort (illustrative)")}
    </div>
  </section>`;
}

// ─────────────────────────── chart grid ───────────────────────────
function donut(beads: Bead[]): string {
  const cats: [string, string, string][] = [
    ["done", "Done", "var(--green)"],
    ["wip", "In progress", "var(--amber)"],
    ["ready", "Ready / open", "var(--blue)"],
    ["blocked", "Blocked", "var(--red)"],
    ["frozen", "Deferred", "var(--slate)"],
  ];
  const counts: Record<string, number> = {};
  for (const b of beads) counts[cat(b.status)] = (counts[cat(b.status)] ?? 0) + 1;
  const total = beads.length || 1;
  const C = 2 * Math.PI * 60;
  let acc = 0;
  const segs: string[] = [];
  const legend: string[] = [];
  for (const [k, label, color] of cats) {
    const n = counts[k] ?? 0;
    if (n > 0) {
      const frac = n / total;
      const seg = frac * C;
      segs.push(`<circle cx="80" cy="80" r="60" fill="none" stroke="${color}" stroke-width="20" stroke-dasharray="${seg.toFixed(2)} ${(C - seg).toFixed(2)}" stroke-dashoffset="${(-acc * C).toFixed(2)}"/>`);
      acc += frac;
    }
    legend.push(`<div class="dr-lg"><span class="sw" style="background:${color}"></span><span class="lb">${label}</span><span class="ct">${n}</span><span class="pc">${Math.round(((n) / total) * 100)}%</span></div>`);
  }
  const donePct = Math.round(((counts.done ?? 0) / total) * 100);
  return `<div class="dr-card"><div class="dr-h">Status mix</div><div class="dr-sub">Where every bead sits right now</div>
    <div class="dr-donut-row"><div class="dr-donut"><svg viewBox="0 0 160 160" style="transform:rotate(-90deg)"><circle cx="80" cy="80" r="60" fill="none" stroke="var(--surface-3)" stroke-width="20"/>${segs.join("")}</svg><div class="dr-donut-c"><div class="n">${donePct}<span>%</span></div><div class="l">complete</div></div></div><div class="dr-donut-leg">${legend.join("")}</div></div></div>`;
}
function priority(beads: Bead[]): string {
  const max = Math.max(...[0, 1, 2, 3, 4].map((pr) => beads.filter((b) => b.priority === pr).length), 1);
  const rows = [0, 1, 2, 3, 4]
    .map((pr) => {
      const n = beads.filter((b) => b.priority === pr).length;
      const color = prioColor(pr);
      return `<div class="dr-pr"><span class="lb"><span class="dot" style="background:${color}"></span>P${pr}</span><div class="bar"><div style="width:${(n / max) * 100}%;background:${color}"></div></div><span class="ct">${n}</span></div>`;
    })
    .join("");
  return `<div class="dr-card"><div class="dr-h">Priority distribution</div><div class="dr-sub">Work weighted toward what matters</div><div class="dr-pr-list">${rows}</div></div>`;
}
function originPanel(beads: Bead[], allow: string[]): string {
  const total = beads.length || 1;
  const make = (kind: "human" | "agent", label: string, icon: string, color: string) => {
    const items = beads.filter((b) => beadOrigin(b, allow) === kind);
    const closed = items.filter((b) => b.status === "closed").length;
    return {
      count: items.length,
      pct: Math.round((items.length / total) * 100),
      card: `<div class="dr-oc"><div class="dr-oc-h"><span class="ic" style="color:${color};background:color-mix(in srgb,${color} 14%,transparent)">${ic(icon, 15)}</span>${label}</div><div class="dr-oc-v"><span class="n">${items.length}</span><span class="u">beads · ${Math.round((items.length / total) * 100)}%</span></div><div class="dr-oc-m">${closed} closed · ${items.length ? Math.round((closed / items.length) * 100) : 0}% done</div></div>`,
    };
  };
  const human = make("human", "Human", "user", "var(--slate)");
  const agent = make("agent", "Agent", "bot", "var(--accent)");
  const note = agent.pct >= 50 ? "agents are now the primary authors" : "humans still lead authorship";
  return `<div class="dr-card"><div class="dr-h">Human vs agent <span class="dr-badge">signature metric</span></div><div class="dr-sub">Who is filing and finishing the work</div>
    <div class="dr-o-cards">${human.card}${agent.card}</div>
    <div class="dr-o-bar"><div style="width:${(human.count / total) * 100}%;background:var(--slate)"></div><div style="width:${(agent.count / total) * 100}%;background:var(--accent)"></div></div>
    <div class="dr-sub">Agents authored <strong>${agent.pct}%</strong> of all beads — ${note}</div></div>`;
}
function workload(beads: Bead[]): string {
  const tasks = beads.filter((b) => b.assignee);
  const names = [...new Set(tasks.map((b) => b.assignee))];
  const rows = names
    .map((name) => {
      const items = tasks.filter((b) => b.assignee === name);
      const done = items.filter((b) => b.status === "closed").length;
      const wip = items.filter((b) => b.status === "in_progress" || b.status === "hooked").length;
      const blk = items.filter((b) => b.status === "blocked").length;
      const open = items.length - done - wip - blk;
      const total = items.length || 1;
      const seg = (v: number, c: string) => (v ? `<div style="width:${(v / total) * 100}%;background:${c}"></div>` : "");
      return {
        total: items.length,
        html: `<div class="dr-wl"><span class="who"><span class="av" style="background:${avatarColor(name)}">${initials(name)}</span><span class="nm">${esc(name)}</span></span><div class="bar">${seg(done, "var(--green)")}${seg(wip, "var(--amber)")}${seg(open, "var(--blue)")}${seg(blk, "var(--red)")}</div><span class="ct">${items.length}</span></div>`,
      };
    })
    .sort((a, b) => b.total - a.total)
    .map((r) => r.html)
    .join("");
  const body = rows || `<div class="dr-sub">No assignees yet.</div>`;
  const leg = [
    ["Done", "var(--green)"],
    ["In progress", "var(--amber)"],
    ["Open", "var(--blue)"],
    ["Blocked", "var(--red)"],
  ]
    .map(([l, c]) => `<span class="dr-wl-lg"><span class="sw" style="background:${c}"></span>${l}</span>`)
    .join("");
  return `<div class="dr-card"><div class="dr-h">Workload by assignee</div><div class="dr-sub">Stacked by current status</div><div class="dr-wl-list">${body}</div><div class="dr-wl-leg">${leg}</div></div>`;
}

// ─────────────────────────── epic progress + risk ───────────────────────────
function epicPanel(beads: Bead[]): string {
  const epics = beads.filter((b) => b.issue_type === "epic");
  const demo = epics.length === 0;
  const rows = (
    demo
      ? [
          { id: "demo-1", title: "Foundation", status: "closed", closed: 8, total: 8 },
          { id: "demo-2", title: "Core features", status: "in_progress", closed: 5, total: 9 },
          { id: "demo-3", title: "Polish & ship", status: "open", closed: 1, total: 6 },
        ]
      : epics.map((e) => {
          const kids = childrenOf(e.id, beads);
          return { id: e.id, title: e.title, status: e.status, closed: kids.filter((k) => k.status === "closed").length, total: kids.length };
        })
  )
    .map((e) => {
      const pct = e.total ? Math.round((e.closed / e.total) * 100) : 0;
      const cc = catColor(e.status);
      return `<div class="dr-ep"><div class="dr-ep-h"><span class="id">${esc(e.id)}</span><span class="t">${esc(e.title)}</span><span class="chip" style="color:${cc};background:color-mix(in srgb,${cc} 16%,transparent);border:1px solid color-mix(in srgb,${cc} 33%,transparent)">${statusLabel(e.status)}</span><span class="pct">${pct}%</span></div><div class="dr-ep-b"><div class="bar"><div style="width:${pct}%;background:${pct === 100 ? "var(--green)" : "var(--accent)"}"></div></div><span class="cnt">${e.closed}/${e.total}</span></div></div>`;
    })
    .join("");
  return `<div class="dr-card"${demo ? " data-demo" : ""}><div class="dr-h">Epic progress</div><div class="dr-sub">Closed ÷ children, live</div><div class="dr-ep-list">${rows}</div></div>`;
}
function riskPanel(beads: Bead[], allow: string[]): string {
  type R = { title: string; meta: string; icon: string; color: string; tag: string; tagC: string };
  const items: R[] = [];
  const seen = new Set<string>();
  const push = (b: Bead, kind: "blocked" | "crit" | "stale") => {
    if (seen.has(b.id)) return;
    seen.add(b.id);
    const m = {
      blocked: { icon: "block", color: "var(--red)", tag: "Blocked", tagC: "var(--red)" },
      crit: { icon: "flame", color: "#f97316", tag: "P0", tagC: "#f97316" },
      stale: { icon: "clock", color: "var(--slate)", tag: "Stale", tagC: "var(--slate)" },
    }[kind];
    items.push({
      title: b.title,
      meta: `${b.id} · ${statusLabel(b.status)} · ${b.assignee || "unassigned"}`,
      icon: m.icon,
      color: m.color,
      tag: m.tag,
      tagC: m.tagC,
    });
  };
  beads.filter((b) => b.status === "blocked").forEach((b) => push(b, "blocked"));
  beads.filter((b) => b.priority === 0 && b.status !== "closed").forEach((b) => push(b, "crit"));
  beads.filter((b) => b.status === "deferred" && b.priority <= 2).slice(0, 2).forEach((b) => push(b, "stale"));
  void allow;
  const list = items.slice(0, 6);
  const body = list.length
    ? list
        .map(
          (r) => `<div class="dr-risk-item">${ic(r.icon, 15, r.color)}<div class="bd"><div class="t">${esc(r.title)}</div><div class="m">${esc(r.meta)}</div></div><span class="tag" style="color:${r.tagC};background:color-mix(in srgb,${r.tagC} 15%,transparent)">${r.tag}</span></div>`,
        )
        .join("")
    : `<div class="dr-risk-clear">${ic("check", 18, "var(--green)")}<span>Nothing blocked, critical, or stalling.</span></div>`;
  const summary = list.length ? `${list.length} beads flagged · blocked, critical or stalling` : "All clear";
  return `<div class="dr-card dr-risk"><div class="dr-h">${ic("alert", 15, "var(--red)")} Needs attention</div><div class="dr-sub">${summary}</div><div class="dr-risk-list">${body}</div></div>`;
}

// ─────────────────────────── assembly ───────────────────────────
export function buildReport(opts: {
  beads: Bead[];
  allow: string[];
  title: string;
  scope: "project" | "all";
  asOf: string;
  now: number;
}): string {
  const { beads, allow, scope, asOf, now } = opts;
  const w = weeklySeries(beads, now);
  const hasTime = w.closed.some((v) => v > 0) || w.created.some((v) => v > 0);
  const where = scope === "all" ? "all projects" : "this project";

  return `<section class="dr" id="dr" data-theme="light" data-curviz="throughput">
  <header class="dr-head">
    <div class="dr-brand"><span class="dr-logo">${ic("logo", 22)}</span><div><h2>Delivery Report</h2><div class="dr-meta">Bead Me Up, Scotty · ${esc(where)} · ${esc(asOf)}</div></div></div>
    <div class="dr-spacer"></div>
    <div class="dr-controls">
      <button class="dr-btn dr-demo-btn" data-act="demo" aria-pressed="false" title="Toggle demo components">${ic("layers", 14)}<span class="lbl">Real data only</span></button>
      <button class="dr-btn dr-icon-btn" data-act="theme" title="Toggle theme"><span class="ic-moon">${ic("moon", 15)}</span><span class="ic-sun">${ic("sun", 15)}</span></button>
    </div>
  </header>
  ${kpiRow(beads, allow, w)}
  ${mainViz(beads, w, hasTime)}
  <section class="dr-grid2">${donut(beads)}${priority(beads)}${originPanel(beads, allow)}${workload(beads)}</section>
  <section class="dr-grid-er">${epicPanel(beads)}${riskPanel(beads, allow)}</section>
  <div class="dr-foot">Generated from bd list --json · ${beads.length} beads · read-only snapshot</div>
  ${reportScript()}
</section>`;
}

function reportScript(): string {
  return `<script>(function(){
  var root=document.getElementById('dr'); if(!root) return;
  var tabs=[].slice.call(root.querySelectorAll('[data-viz]'));
  function showViz(key){
    root.querySelectorAll('[data-viz-panel]').forEach(function(p){p.style.display=p.getAttribute('data-viz-panel')===key?'':'none';});
    tabs.forEach(function(t){t.classList.toggle('on',t.getAttribute('data-viz')===key);});
    root.setAttribute('data-curviz',key);
  }
  function visible(){var on=root.classList.contains('demo');return tabs.filter(function(t){return on||!t.hasAttribute('data-demo');});}
  function ensure(){var vis=visible();var cur=root.getAttribute('data-curviz');if(!vis.some(function(t){return t.getAttribute('data-viz')===cur;})&&vis.length)showViz(vis[0].getAttribute('data-viz'));}
  tabs.forEach(function(t){t.addEventListener('click',function(){showViz(t.getAttribute('data-viz'));});});
  var demoBtn=root.querySelector('[data-act=demo]');
  function sync(){var on=root.classList.contains('demo');demoBtn.setAttribute('aria-pressed',on);var l=demoBtn.querySelector('.lbl');if(l)l.textContent=on?'Showing demo data':'Real data only';ensure();}
  demoBtn.addEventListener('click',function(){root.classList.toggle('demo');sync();});
  var themeBtn=root.querySelector('[data-act=theme]');
  themeBtn.addEventListener('click',function(){root.setAttribute('data-theme',root.getAttribute('data-theme')==='dark'?'light':'dark');});
  var real=tabs.filter(function(t){return !t.hasAttribute('data-demo');});
  showViz((real[0]||tabs[0]).getAttribute('data-viz'));
  sync();
})();</script>`;
}

export function reportCss(): string {
  return `
.dr{--bg:#f6f6f8;--surface:#fff;--surface-2:#f1f1f4;--surface-3:#e9e9ee;--border:#e7e7ec;--text:#16161a;--text-2:#62626d;--text-3:#9a9aa5;--accent:#6d5ef0;--accent-2:#5546e0;--accent-weak:#efedfd;--green:#16a34a;--amber:#d97706;--red:#ef4444;--blue:#3b82f6;--slate:#64748b;--grid-line:#ececf1;--shadow:0 1px 2px rgba(20,20,30,.05);--shadow-md:0 4px 16px -6px rgba(20,20,40,.12);
  max-width:1180px;margin:0 auto 10px;padding:22px 24px;background:var(--bg);color:var(--text);border-bottom:1px solid var(--border);font-size:14px;border-radius:0 0 18px 18px}
.dr[data-theme=dark]{--bg:#0a0a0d;--surface:#141417;--surface-2:#1c1c21;--surface-3:#26262d;--border:#26262d;--text:#f2f2f5;--text-2:#a2a2ad;--text-3:#6c6c77;--accent:#8b7cf8;--accent-2:#9c8ffa;--accent-weak:#211d3a;--green:#22c55e;--amber:#f59e0b;--red:#f87171;--blue:#60a5fa;--slate:#94a3b8;--grid-line:#222228}
.dr *{box-sizing:border-box}
.dr:not(.demo) [data-demo]{display:none!important}
.dr-head{display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap}
.dr-brand{display:flex;align-items:center;gap:12px}
.dr-logo{width:40px;height:40px;border-radius:11px;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 4px 14px -3px var(--accent)}
.dr-head h2{margin:0;font-size:21px;font-weight:750;letter-spacing:-.025em;line-height:1.05}
.dr-meta{font-size:12.5px;color:var(--text-3);margin-top:2px}
.dr-spacer{flex:1}
.dr-controls{display:flex;gap:9px}
.dr-btn{height:36px;display:inline-flex;align-items:center;gap:7px;padding:0 12px;border:1px solid var(--border);background:var(--surface);color:var(--text-2);border-radius:9px;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:var(--shadow)}
.dr-btn:hover{background:var(--surface-2);color:var(--text)}
.dr-demo-btn[aria-pressed=true]{border-color:var(--accent);color:var(--accent);background:var(--accent-weak)}
.dr-icon-btn{width:36px;padding:0;justify-content:center}
.dr .ic-sun{display:none}.dr[data-theme=dark] .ic-sun{display:inline-flex}.dr[data-theme=dark] .ic-moon{display:none}
.dr-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);padding:18px 20px}
.dr-h{font-size:13.5px;font-weight:650;display:flex;align-items:center;gap:8px}
.dr-sub{font-size:11.5px;color:var(--text-3);margin:2px 0 10px}
.dr-badge{font-size:10px;font-weight:600;color:var(--accent);background:var(--accent-weak);border-radius:5px;padding:2px 6px}
.dr-foot{text-align:center;margin-top:18px;font-size:11px;color:var(--text-3);font-family:ui-monospace,Menlo,monospace}
/* KPI */
.dr-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:14px}
.dr-kpi{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px;box-shadow:var(--shadow)}
.dr-kpi-h{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.dr-kpi-ic{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.dr-kpi-l{font-size:10.5px;color:var(--text-3);font-weight:600;letter-spacing:.02em;text-transform:uppercase;line-height:1.15}
.dr-kpi-v{display:flex;align-items:baseline;gap:4px}
.dr-kpi-v .n{font-size:26px;font-weight:750;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1}
.dr-kpi-v .u{font-size:13px;color:var(--text-3);font-weight:600}
.dr-kpi-f{display:flex;align-items:center;gap:5px;margin-top:7px;height:18px}
.dr-spk{display:flex;align-items:flex-end;gap:2px;height:16px;flex:1}
.dr-spk span{flex:1;border-radius:2px;opacity:.5}
.dr-kpi-f .d{font-size:10.5px;font-weight:600;white-space:nowrap}
/* main viz */
.dr-main{padding:0;margin-bottom:14px;overflow:hidden;box-shadow:var(--shadow-md)}
.dr-main-head{padding:14px 16px;border-bottom:1px solid var(--border)}
.dr-main-tabs{display:inline-flex;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:3px;gap:2px}
.dr-tab{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:7px;border:none;cursor:pointer;font-size:12.5px;font-weight:500;background:transparent;color:var(--text-3)}
.dr-tab.on{background:var(--surface);color:var(--text);box-shadow:var(--shadow);font-weight:600}
.dr-main-body{padding:18px 20px}
.dr-viz-cap{margin-bottom:12px}.dr-viz-cap b{font-size:14px}.dr-viz-cap span{font-size:11.5px;color:var(--text-3);margin-left:8px}
.dr-viz-row{display:flex;gap:18px;align-items:stretch;flex-wrap:wrap}
.dr-svg{width:100%;max-width:760px;flex:1;min-width:380px;height:auto;overflow:visible}
.dr-svg line{stroke-width:1}
.dr-viz-side{display:flex;flex-direction:column;gap:11px;justify-content:center;min-width:160px;flex:0 0 auto}
.dr-leg{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-2)}
.dr-leg .sw{width:16px;height:4px;border-radius:2px;display:inline-block}.dr-leg .ln{width:18px;display:inline-block}
.dr-side-stats{border-top:1px solid var(--border);margin-top:4px;padding-top:12px;display:flex;flex-direction:column;gap:9px}
.dr-side-stats .bn{font-size:21px;font-weight:750;letter-spacing:-.02em}.dr-side-stats .bl{font-size:11px;color:var(--text-3)}
.dr-side-note{font-size:11.5px;color:var(--text-3);line-height:1.5;max-width:200px}
/* gantt */
.dr-gantt-head,.dr-gantt-row{display:flex;align-items:center}
.dr-gantt-row{height:46px}
.dr-gantt-label{width:200px;flex-shrink:0;padding-right:12px;display:flex;align-items:center;gap:9px}
.dr-gantt-label .dot{width:9px;height:9px;border-radius:3px;flex-shrink:0}
.dr-gantt-label .t{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dr-gantt-label .m{font-size:10.5px;color:var(--text-3);font-family:ui-monospace,monospace}
.dr-gantt-track{flex:1;position:relative;height:100%;display:flex}
.dr-gantt-col{flex:1;text-align:center;font-size:10.5px;color:var(--text-3);border-left:1px solid var(--grid-line)}
.dr-gantt-head .dr-gantt-track{height:24px}
.dr-gantt-cell{flex:1;border-left:1px solid var(--grid-line)}
.dr-gantt-bar{position:absolute;top:9px;height:28px;border-radius:7px;display:flex;align-items:center;overflow:hidden}
.dr-gantt-bar .fill{position:absolute;left:0;top:0;bottom:0;border-radius:6px;opacity:.92}
.dr-gantt-bar .pct{position:relative;z-index:2;font-size:10.5px;font-weight:650;padding-left:9px}
/* grids */
.dr-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.dr-grid-er{display:grid;grid-template-columns:1.4fr 1fr;gap:14px}
.dr-donut-row{display:flex;align-items:center;gap:20px}
.dr-donut{position:relative;width:160px;height:160px;flex-shrink:0}
.dr-donut svg{width:160px;height:160px}
.dr-donut-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.dr-donut-c .n{font-size:30px;font-weight:780;letter-spacing:-.03em;line-height:1}.dr-donut-c .n span{font-size:15px}
.dr-donut-c .l{font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.dr-donut-leg{flex:1;display:flex;flex-direction:column;gap:9px}
.dr-lg{display:flex;align-items:center;gap:9px}
.dr-lg .sw{width:9px;height:9px;border-radius:3px}.dr-lg .lb{flex:1;font-size:12.5px;color:var(--text-2)}.dr-lg .ct{font-size:12.5px;font-weight:650}.dr-lg .pc{font-size:11px;color:var(--text-3);width:34px;text-align:right;font-family:ui-monospace,monospace}
.dr-pr-list{display:flex;flex-direction:column;gap:12px}
.dr-pr{display:flex;align-items:center;gap:11px}
.dr-pr .lb{width:70px;flex-shrink:0;display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--text-2)}
.dr-pr .lb .dot{width:8px;height:8px;border-radius:50%}
.dr-pr .bar{flex:1;height:18px;border-radius:6px;background:var(--surface-2);overflow:hidden}.dr-pr .bar div{height:100%;border-radius:6px}
.dr-pr .ct{width:26px;text-align:right;font-size:12.5px;font-weight:650}
.dr-o-cards{display:flex;gap:14px;margin-bottom:14px}
.dr-oc{flex:1;border:1px solid var(--border);border-radius:12px;padding:13px;background:var(--surface-2)}
.dr-oc-h{display:flex;align-items:center;gap:8px;margin-bottom:9px;font-size:12.5px;font-weight:600}
.dr-oc-h .ic{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center}
.dr-oc-v{display:flex;align-items:baseline;gap:5px}.dr-oc-v .n{font-size:24px;font-weight:750;letter-spacing:-.03em}.dr-oc-v .u{font-size:11.5px;color:var(--text-3)}
.dr-oc-m{font-size:11px;color:var(--text-3);margin-top:3px}
.dr-o-bar{display:flex;height:13px;border-radius:7px;overflow:hidden;gap:2px;margin-bottom:9px}.dr-o-bar div{height:100%}
.dr-wl-list{display:flex;flex-direction:column;gap:11px}
.dr-wl{display:flex;align-items:center;gap:10px}
.dr-wl .who{width:120px;flex-shrink:0;display:flex;align-items:center;gap:7px}
.dr-wl .av{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:650;color:#fff;flex-shrink:0}
.dr-wl .nm{font-size:12px;font-weight:550;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dr-wl .bar{flex:1;height:16px;border-radius:5px;background:var(--surface-2);overflow:hidden;display:flex}.dr-wl .bar div{height:100%}
.dr-wl .ct{width:22px;text-align:right;font-size:12.5px;font-weight:650}
.dr-wl-leg{display:flex;gap:14px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);flex-wrap:wrap}
.dr-wl-lg{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-3)}.dr-wl-lg .sw{width:9px;height:9px;border-radius:3px}
.dr-ep-list{display:flex;flex-direction:column;gap:14px}
.dr-ep-h{display:flex;align-items:center;gap:9px;margin-bottom:6px}
.dr-ep-h .id{font-family:ui-monospace,monospace;font-size:10.5px;color:var(--text-3);flex-shrink:0}
.dr-ep-h .t{font-size:12.5px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dr-ep-h .chip{font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;flex-shrink:0}
.dr-ep-h .pct{font-size:12.5px;font-weight:700;width:38px;text-align:right}
.dr-ep-b{display:flex;align-items:center;gap:10px}
.dr-ep-b .bar{flex:1;height:9px;border-radius:6px;background:var(--surface-2);overflow:hidden}.dr-ep-b .bar div{height:100%;border-radius:6px}
.dr-ep-b .cnt{font-size:11px;color:var(--text-3);font-family:ui-monospace,monospace;width:54px;text-align:right}
.dr-risk{display:flex;flex-direction:column}
.dr-risk-list{display:flex;flex-direction:column;gap:8px}
.dr-risk-item{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2)}
.dr-risk-item .bd{flex:1;min-width:0}
.dr-risk-item .t{font-size:12.5px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dr-risk-item .m{font-size:10.5px;color:var(--text-3);font-family:ui-monospace,monospace}
.dr-risk-item .tag{font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;flex-shrink:0}
.dr-risk-clear{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--text-2);padding:10px}
@media(max-width:900px){.dr-kpis{grid-template-columns:repeat(3,1fr)}.dr-grid2,.dr-grid-er{grid-template-columns:1fr}}
`;
}
