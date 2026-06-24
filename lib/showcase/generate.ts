import "server-only";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getStore } from "../store";
import { getProject, listProjects, getConfig, DEMO_PROJECT } from "../config";
import { beadOrigin } from "../attribution";
import { statusLabel, typeLabel, prioLabel, fmtDate, relTime } from "../beads-view";
import { readInteractions } from "../interactions";
import { computeGamification } from "../gamification";
import { buildReport, reportCss } from "./report";
import type { Bead } from "../schema";

const pExecFile = promisify(execFile);

export type ShowcaseTemplate = "manager" | "timeline" | "portfolio";
export interface ShowcaseOptions {
  projectId: string;
  template: ShowcaseTemplate;
  title: string;
  scope: "project" | "all";
  stats: boolean;
  search: boolean;
  /** Include the gamification block (level/XP, badges, leaderboard). */
  gamification?: boolean;
}
export interface ShowcaseResult {
  outDir: string;
  indexPath: string;
  count: number;
}

/** Resolve the Eleventy CLI entry (works under a global install too). */
// Resolve the Eleventy CLI purely from the filesystem. We must NOT use
// require.resolve("@11ty/eleventy") — it's a serverExternalPackages package, and
// Turbopack rewrites that call into an internal "[externals]/…" reference string
// at build time, yielding a bogus path. Scanning node_modules is bundler-proof.
function eleventyBin(): string {
  const rel = path.join("node_modules", "@11ty", "eleventy", "cmd.cjs");
  const candidates = [path.join(process.cwd(), rel)];
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    candidates.push(path.join(dir, rel));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("Could not locate the @11ty/eleventy CLI (is it installed?)");
}

const safeSlug = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "-");

/** Where the built site lives. Real projects keep it in .beads (gitignored). */
function outputBase(opts: ShowcaseOptions): string {
  if (opts.scope === "project" && opts.projectId !== DEMO_PROJECT.id) {
    const p = getProject(opts.projectId);
    if (p && p.path) return path.join(p.path, ".beads", "showcase");
  }
  return path.join(os.tmpdir(), `bmus-showcase-${safeSlug(opts.projectId)}-${opts.scope}`);
}

async function gatherBeads(opts: ShowcaseOptions): Promise<Bead[]> {
  if (opts.scope === "all") {
    const out: Bead[] = [];
    for (const p of listProjects()) {
      try {
        out.push(...(await (await getStore(p.id)).list()));
      } catch {
        /* skip unreachable project */
      }
    }
    return out;
  }
  return (await getStore(opts.projectId)).list();
}

function computeStats(beads: Bead[], allow: string[]) {
  const tally = (key: (b: Bead) => string) => {
    const m: Record<string, number> = {};
    for (const b of beads) m[key(b)] = (m[key(b)] ?? 0) + 1;
    return m;
  };
  const human = beads.filter((b) => beadOrigin(b, allow) === "human").length;
  return {
    total: beads.length,
    done: beads.filter((b) => b.status === "closed").length,
    inProgress: beads.filter((b) => b.status === "in_progress" || b.status === "hooked").length,
    byStatus: tally((b) => b.status),
    byType: tally((b) => b.issue_type),
    byPriority: tally((b) => String(b.priority)),
    human,
    agent: beads.length - human,
  };
}

/** Light view-model for each bead (used for cards + client search). */
/** Gamification summary for the published page (level, badges, leaderboard). */
function buildGameData(opts: ShowcaseOptions, beads: Bead[], allow: string[]) {
  // Interactions are per-project; for "all" scope fall back to bead timestamps.
  let events: ReturnType<typeof readInteractions> = [];
  if (opts.scope === "project") {
    const p = getProject(opts.projectId);
    const repoPath = p && "path" in p ? p.path : null;
    if (repoPath) events = readInteractions(repoPath);
  }
  const g = computeGamification(beads, events, allow, getConfig().humanActor, Date.now());
  return {
    level: g.you.level,
    totalXp: g.totalXp,
    totalClosed: g.totalClosed,
    badges: g.you.badges.filter((b) => b.earned).map((b) => ({ label: b.label })),
    leaders: g.actors
      .slice(0, 8)
      .map((a) => ({ actor: a.actor, origin: a.origin, xp: a.xp, streak: a.currentStreak })),
  };
}

function viewModel(beads: Bead[], allow: string[]) {
  return beads
    .map((b) => ({
      id: b.id,
      slug: safeSlug(b.id),
      title: b.title,
      status: b.status,
      statusLabel: statusLabel(b.status),
      type: b.issue_type,
      typeLabel: typeLabel(b.issue_type),
      priority: b.priority,
      priorityLabel: prioLabel(b.priority),
      assignee: b.assignee || "Unassigned",
      origin: beadOrigin(b, allow),
      updated: b.updated_at || b.created_at || "",
      updatedLabel: relTime(b.updated_at || b.created_at),
      closedLabel: b.closed_at ? fmtDate(b.closed_at) : "",
      labels: (b.labels ?? []).filter((l) => l !== "archived"),
    }))
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
}

/** Strip attachment image refs (they don't resolve in a static export). */
function publishBody(b: Bead): string {
  const desc = (b.description || "").replace(/!\[[^\]]*\]\(attachment:\/\/[^)\s]+\)/g, "").trim();
  const comments = (b.comments ?? [])
    .map((c) => `> **${c.author || "someone"}** · ${relTime(c.created_at)}\n>\n> ${(c.text || "").replace(/\n/g, "\n> ")}`)
    .join("\n\n");
  return [desc || "_No description._", comments && `\n\n---\n\n### Comments\n\n${comments}`].filter(Boolean).join("");
}

export async function buildShowcase(opts: ShowcaseOptions): Promise<ShowcaseResult> {
  const beads = (await gatherBeads(opts)).filter((b) => !(b.labels ?? []).includes("archived"));
  const allow = getConfig().humanAllowlist;
  const stats = computeStats(beads, allow);
  const cards = viewModel(beads, allow);
  const gamification = opts.gamification ? buildGameData(opts, beads, allow) : null;
  // Delivery Report dashboard injected at the top of the published home page.
  // Best-effort: a failure here must not break the whole publish.
  let report = "";
  try {
    report = buildReport({
      beads,
      allow,
      title: opts.title,
      scope: opts.scope,
      asOf: `as of ${fmtDate(new Date().toISOString())}`,
      now: Date.now(),
    });
  } catch {
    report = "";
  }

  const base = outputBase(opts);
  fs.rmSync(base, { recursive: true, force: true });
  const src = path.join(base, "site-src");
  fs.mkdirSync(path.join(src, "_includes"), { recursive: true });
  fs.mkdirSync(path.join(src, "_data"), { recursive: true });
  fs.mkdirSync(path.join(src, "beads"), { recursive: true });

  // eleventy config (CJS)
  fs.writeFileSync(
    path.join(base, "eleventy.config.cjs"),
    `module.exports = function (c) {\n  return { markdownTemplateEngine: "njk", htmlTemplateEngine: "njk", dir: { includes: "_includes", data: "_data" } };\n};\n`,
  );

  // global data
  fs.writeFileSync(
    path.join(src, "_data", "site.json"),
    JSON.stringify(
      {
        title: opts.title,
        generated: fmtDate(new Date().toISOString()),
        scope: opts.scope,
        statsEnabled: opts.stats,
        searchEnabled: opts.search,
        gamificationEnabled: !!gamification,
        template: opts.template,
        stats,
        gamification,
        cards,
        report,
        css: pageCss(opts.template) + reportCss(),
      },
      null,
      0,
    ),
  );

  // layouts
  fs.writeFileSync(path.join(src, "_includes", "base.njk"), baseLayout());
  fs.writeFileSync(path.join(src, "_includes", "bead.njk"), beadLayout());
  // home (template-specific)
  fs.writeFileSync(path.join(src, "index.njk"), homePage(opts.template));

  // per-bead markdown (layout set per-file — directory-data didn't apply reliably)
  for (const b of beads) {
    const fm = [
      "---",
      `layout: bead.njk`,
      // Flat .html files (not pretty-URL directories): a browser opening the site
      // over file:// can't resolve beads/<slug>/ to its index.html — it shows a
      // directory listing. Explicit .html files open directly.
      `permalink: ${JSON.stringify(`beads/${safeSlug(b.id)}.html`)}`,
      `id: ${JSON.stringify(b.id)}`,
      `title: ${JSON.stringify(b.title)}`,
      `status: ${JSON.stringify(statusLabel(b.status))}`,
      `type: ${JSON.stringify(typeLabel(b.issue_type))}`,
      `priority: ${JSON.stringify(prioLabel(b.priority))}`,
      `assignee: ${JSON.stringify(b.assignee || "Unassigned")}`,
      `origin: ${JSON.stringify(beadOrigin(b, allow))}`,
      `updated: ${JSON.stringify(relTime(b.updated_at || b.created_at))}`,
      "---",
    ].join("\n");
    fs.writeFileSync(path.join(src, "beads", `${safeSlug(b.id)}.md`), `${fm}\n\n${publishBody(b)}\n`);
  }

  const out = path.join(base, "_site");
  await pExecFile(process.execPath, [eleventyBin(), "--input", src, "--output", out, "--config", path.join(base, "eleventy.config.cjs")], {
    cwd: base,
    maxBuffer: 64 * 1024 * 1024,
  });

  return { outDir: out, indexPath: path.join(out, "index.html"), count: beads.length };
}

// ─────────────────────────── templates (strings) ───────────────────────────

function baseLayout(): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ site.title }}</title>
<style>{{ site.css | safe }}</style>
</head><body>
{{ content | safe }}
<footer class="ft">Generated by <a href="https://github.com/brendan-appstart/bead-me-up-scotty">Bead Me Up, Scotty</a> · {{ site.generated }}</footer>
{% if site.searchEnabled %}<script>window.__BEADS__={{ site.cards | dump | safe }};</script>{% endif %}
</body></html>`;
}

function statBar(): string {
  // shared stats block, used by all templates when enabled
  return `{% if site.statsEnabled %}
<section class="stats">
  <div class="stat"><div class="n">{{ site.stats.total }}</div><div class="l">Total</div></div>
  <div class="stat done"><div class="n">{{ site.stats.done }}</div><div class="l">Shipped</div></div>
  <div class="stat wip"><div class="n">{{ site.stats.inProgress }}</div><div class="l">In progress</div></div>
  <div class="stat"><div class="n">{{ site.stats.human }}<span class="vs">/</span>{{ site.stats.agent }}</div><div class="l">Human / Agent</div></div>
</section>{% endif %}`;
}

function searchBox(): string {
  return `{% if site.searchEnabled %}<input id="q" class="search" type="search" placeholder="Search beads…" oninput="(function(v){v=v.value.toLowerCase();document.querySelectorAll('[data-bead]').forEach(function(e){e.style.display=(e.getAttribute('data-text')||'').indexOf(v)>-1?'':'none'})})(this)">{% endif %}`;
}

function cardLoop(): string {
  return `<div class="grid">
{% for b in site.cards %}
  <a class="card s-{{ b.status }}" data-bead data-text="{{ (b.id + ' ' + b.title + ' ' + b.assignee + ' ' + b.typeLabel + ' ' + b.statusLabel) | lower }}" href="beads/{{ b.slug }}.html">
    <div class="row"><span class="dot"></span><span class="id">{{ b.id }}</span><span class="pill p{{ b.priority }}">{{ b.priorityLabel }}</span></div>
    <div class="t">{{ b.title }}</div>
    <div class="meta"><span class="type">{{ b.typeLabel }}</span><span class="who {{ b.origin }}">{{ b.origin }}</span><span class="upd">{{ b.updatedLabel }}</span></div>
  </a>
{% endfor %}
</div>`;
}

function homePage(t: ShowcaseTemplate): string {
  // Delivery Report (data-backed dashboard) rendered at the very top of the page.
  const report = `{% if site.report %}{{ site.report | safe }}{% endif %}`;
  const hero = `<header class="hero"><h1>{{ site.title }}</h1><p class="sub">{% if site.scope == 'all' %}Across all projects{% else %}A look at what we're getting done{% endif %} · {{ site.generated }}</p></header>`;
  if (t === "timeline") {
    return `---\nlayout: base.njk\n---\n${report}\n${hero}\n${statBar()}\n${gameBlock()}\n<div class="bar">${searchBox()}</div>\n<ol class="timeline">\n{% for b in site.cards %}\n  <li data-bead data-text="{{ (b.id + ' ' + b.title + ' ' + b.assignee) | lower }}"><a href="beads/{{ b.slug }}.html"><span class="when">{{ b.updatedLabel }}</span><span class="dot s-{{ b.status }}"></span><span class="body"><b>{{ b.title }}</b><span class="meta">{{ b.id }} · {{ b.statusLabel }} · {{ b.typeLabel }} · <i class="who {{ b.origin }}">{{ b.origin }}</i></span></span></a></li>\n{% endfor %}\n</ol>`;
  }
  // manager + portfolio both use the card grid; manager leads with bigger stats
  return `---\nlayout: base.njk\n---\n${report}\n${hero}\n${statBar()}\n${gameBlock()}\n<div class="bar">${searchBox()}</div>\n${cardLoop()}`;
}

function gameBlock(): string {
  return `{% if site.gamificationEnabled %}
<section class="game">
  <div class="game-head"><span class="lvl">Level {{ site.gamification.level }}</span><span class="xp">{{ site.gamification.totalXp }} XP</span><span class="cl">{{ site.gamification.totalClosed }} closed</span></div>
  {% if site.gamification.badges.length %}<div class="badges">{% for b in site.gamification.badges %}<span class="badge">🏅 {{ b.label }}</span>{% endfor %}</div>{% endif %}
  <ol class="lb">{% for a in site.gamification.leaders %}<li><span class="r">{{ loop.index }}</span><span class="who {{ a.origin }}">{{ a.origin }}</span><span class="nm">{{ a.actor }}</span>{% if a.streak %}<span class="st">🔥{{ a.streak }}</span>{% endif %}<span class="v">{{ a.xp }} XP</span></li>{% endfor %}</ol>
</section>
{% endif %}`;
}

function beadLayout(): string {
  return `---\nlayout: base.njk\n---
<header class="hero sm"><a class="back" href="../index.html">← {{ site.title }}</a></header>
<article class="bead">
  <div class="row"><span class="id">{{ id }}</span><span class="chip">{{ status }}</span><span class="chip">{{ type }}</span><span class="chip">{{ priority }}</span><span class="who {{ origin }}">{{ origin }}</span></div>
  <h1>{{ title }}</h1>
  <div class="prose">{{ content | safe }}</div>
  <div class="upd">Updated {{ updated }} · {{ assignee }}</div>
</article>`;
}

function pageCss(t: ShowcaseTemplate): string {
  const accent = "#7c6cff";
  const base = `
*{box-sizing:border-box}
body{margin:0;font:15px/1.55 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a22;background:#f6f7fb}
a{color:inherit;text-decoration:none}
.hero{max-width:1040px;margin:0 auto;padding:48px 24px 8px}
.hero h1{margin:0;font-size:38px;letter-spacing:-.02em}
.hero .sub{color:#6b7280;margin:.4em 0 0}
.hero.sm{padding:24px 24px 0}.back{color:${accent};font-weight:600}
.bar{max-width:1040px;margin:0 auto;padding:14px 24px}
.search{width:100%;max-width:420px;padding:10px 14px;border:1px solid #e3e5ee;border-radius:10px;font-size:14px;background:#fff;outline:none}
.search:focus{border-color:${accent}}
.stats{max-width:1040px;margin:18px auto 0;padding:0 24px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.stat{background:#fff;border:1px solid #eceef5;border-radius:14px;padding:18px}
.stat .n{font-size:30px;font-weight:750;letter-spacing:-.02em}.stat .l{color:#6b7280;font-size:12.5px;margin-top:2px}
.stat.done .n{color:#16a34a}.stat.wip .n{color:#d97706}.stat .vs{color:#c3c7d2;margin:0 4px}
.grid{max-width:1040px;margin:8px auto 40px;padding:0 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.card{display:block;background:#fff;border:1px solid #eceef5;border-radius:13px;padding:14px 16px;transition:border-color .15s,box-shadow .15s}
.card:hover{border-color:${accent};box-shadow:0 8px 28px -12px rgba(99,102,241,.4)}
.card .row{display:flex;align-items:center;gap:8px}
.card .dot{width:9px;height:9px;border-radius:50%;background:#94a3b8}
.card.s-closed .dot{background:#16a34a}.card.s-in_progress .dot,.card.s-hooked .dot{background:#d97706}.card.s-blocked .dot{background:#ef4444}.card.s-open .dot{background:#3b82f6}.card.s-deferred .dot{background:#64748b}
.card .id{font:12px ui-monospace,Menlo,monospace;color:#9aa0aa}
.card .t{font-weight:600;margin:8px 0;line-height:1.35}
.card .meta{display:flex;gap:8px;align-items:center;font-size:12px;color:#6b7280;flex-wrap:wrap}
.pill{margin-left:auto;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:6px;background:#eef0f6;color:#475569}
.pill.p0{background:#fee2e2;color:#b91c1c}.pill.p1{background:#ffedd5;color:#c2410c}.pill.p2{background:#fef9c3;color:#854d0e}
.who{text-transform:capitalize;font-weight:600;font-size:11px;padding:1px 7px;border-radius:6px}
.who.human{background:#eef2ff;color:#4338ca}.who.agent{background:#ecfeff;color:#0e7490}
.bead{max-width:760px;margin:8px auto 48px;padding:0 24px}
.bead h1{font-size:28px;letter-spacing:-.02em}
.chip{font-size:12px;padding:2px 9px;border-radius:7px;background:#eef0f6;color:#475569}
.prose{background:#fff;border:1px solid #eceef5;border-radius:13px;padding:18px 20px;margin-top:14px;white-space:normal}
.prose blockquote{border-left:3px solid #e3e5ee;margin:12px 0;padding-left:12px;color:#6b7280}
.upd{color:#9aa0aa;font-size:12.5px;margin-top:12px}
.timeline{max-width:760px;margin:8px auto 48px;padding:0 24px;list-style:none}
.timeline li{margin:0}.timeline a{display:flex;gap:14px;padding:12px 0;border-bottom:1px solid #edeff5}
.timeline .when{width:64px;flex:none;color:#9aa0aa;font-size:12px;text-align:right;padding-top:2px}
.timeline .dot{width:11px;height:11px;border-radius:50%;flex:none;margin-top:5px;background:#94a3b8}
.timeline .dot.s-closed{background:#16a34a}.timeline .dot.s-in_progress{background:#d97706}.timeline .dot.s-blocked{background:#ef4444}.timeline .dot.s-open{background:#3b82f6}
.timeline .body{display:flex;flex-direction:column}.timeline .meta{color:#6b7280;font-size:12.5px;margin-top:2px}
.ft{max-width:1040px;margin:0 auto;padding:24px;color:#9aa0aa;font-size:12.5px;text-align:center}
.game{max-width:1040px;margin:18px auto 0;padding:18px 24px}
.game-head{display:flex;gap:16px;align-items:baseline;font-weight:700}
.game-head .lvl{font-size:20px;letter-spacing:-.01em}.game-head .xp,.game-head .cl{color:#6b7280;font-size:13px;font-weight:600}
.badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.badge{background:#efeefe;color:#5b46e0;border-radius:8px;padding:4px 9px;font-size:12px;font-weight:600}
.lb{max-width:520px;margin:12px 0 0;padding:0;list-style:none}
.lb li{display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid #edeff5;font-size:13px}
.lb .r{width:18px;color:#9aa0aa;font:12px ui-monospace,Menlo,monospace}.lb .nm{flex:1}.lb .v{font-weight:700}
@media(max-width:640px){.stats{grid-template-columns:repeat(2,1fr)}.hero h1{font-size:30px}}
`;
  const themes: Record<ShowcaseTemplate, string> = {
    manager: `.hero{background:linear-gradient(180deg,#efeefe,transparent)}`,
    timeline: `.hero h1::before{content:"⏱ "}`,
    portfolio: `body{background:#fff}.card{border-radius:16px}`,
  };
  return base + themes[t];
}
