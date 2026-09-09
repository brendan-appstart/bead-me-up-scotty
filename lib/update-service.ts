import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import type { UpdateChannel, UpdateStatus, UpdateTarget, UpdateResult, UpdateStep } from "./update-types";

const exec = promisify(execFile);
type Runner = (cmd: string, args: string[], options: { cwd: string; timeout: number; maxBuffer: number }) => Promise<{ stdout: string; stderr: string }>;
type Options = { cwd: string; version: string; buildSha?: string; repository: string; remote?: string; supervised?: boolean; fetch?: typeof fetch; run?: Runner };
const tagPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function versionParts(value: string) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);
  if (!match) throw new Error("Invalid version metadata. Check the release instructions.");
  return { numbers: match.slice(1, 4).map(Number), prerelease: !!match[4] };
}
function newer(stable: string, current: string): boolean {
  const a = versionParts(stable), b = versionParts(current);
  for (let i = 0; i < 3; i++) if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] > b.numbers[i];
  return b.prerelease;
}

/** Release discovery and exact-target updates. The app wrapper supplies build-time version metadata. */
export function createUpdater(options: Options) {
  const { cwd, version, repository } = options;
  const remote = options.remote ?? `https://github.com/${repository}.git`;
  const send = options.fetch ?? fetch;
  const runner: Runner = options.run ?? ((cmd, args, opts) => exec(cmd, args, opts));
  let updating = false;
  let restartPending = false;
  let cached: { until: number; value: string | null } | undefined;
  let pending: Promise<string | null> | undefined;
  const isGit = () => fs.existsSync(path.join(cwd, ".git"));
  const git = async (...args: string[]) => (await runner("git", args, { cwd, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
  async function releaseTag(tag?: string): Promise<string | null> {
    const response = await send(`https://api.github.com/repos/${repository}/releases/${tag ? `tags/${encodeURIComponent(tag)}` : "latest"}`, {
      headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    if (response.status === 404 && !tag) return null;
    if (!response.ok) throw new Error(`Release check unavailable (${response.status}). Try again later.`);
    const value = await response.json();
    if (value.draft || value.prerelease || typeof value.tag_name !== "string" || !tagPattern.test(value.tag_name) || (tag && value.tag_name !== tag)) {
      throw new Error("Invalid stable release metadata.");
    }
    return value.tag_name;
  }
  async function latest() {
    if (cached && cached.until > Date.now()) return cached.value;
    if (!pending) pending = releaseTag().then(value => { cached = { value, until: Date.now() + 300_000 }; return value; }).finally(() => { pending = undefined; });
    return pending;
  }
  async function resolve(channel: UpdateChannel, tag?: string) {
    const ref = channel === "stable" ? `refs/tags/${tag}` : "refs/heads/main";
    const lines = (await git("ls-remote", remote, ref, `${ref}^{}`)).split("\n");
    const refs = new Map(lines.map(line => line.split(/\s+/)) as [string, string][]);
    // ls-remote puts the SHA first; prefer the peeled commit for annotated tags.
    const entries = [...refs];
    const sha = entries.find(([, name]) => name === `${ref}^{}`)?.[0] ?? entries.find(([, name]) => name === ref)?.[0];
    if (!sha || !/^[a-f0-9]{40}$/.test(sha)) throw new Error("The update target is unavailable.");
    return sha;
  }
  async function checkoutProblem(): Promise<string | undefined> {
    if (!isGit()) return "This installation needs a manual update. Follow the instructions in the release notes for a global copy, source download, or Docker installation.";
    const branch = await git("branch", "--show-current");
    if (branch && branch !== "main") return "Switch to the main branch before updating; your working branch will not be changed.";
    if (await git("status", "--porcelain")) return "Your checkout has uncommitted changes. Commit or stash them before updating.";
  }
  async function check(channel: UpdateChannel = "stable"): Promise<UpdateStatus> {
    const base: UpdateStatus = { channel, currentVersion: version, isGitRepo: isGit(), supervised: !!options.supervised,
      updateAvailable: false, canUpdate: false, behind: 0, localSha: "", remoteSha: "" };
    try {
      if (channel === "stable") {
        const tag = await latest();
        if (!tag) return base;
        base.latestVersion = tag.replace(/^v/, "");
        base.releaseUrl = `https://github.com/${repository}/releases/tag/${encodeURIComponent(tag)}`;
        base.updateAvailable = newer(tag, version);
        if (!base.updateAvailable) return base;
        base.manualReason = await checkoutProblem();
        if (!base.isGitRepo) return base;
        base.localSha = await git("rev-parse", "HEAD");
        base.remoteSha = await resolve(channel, tag);
        base.target = { channel, tag, sha: base.remoteSha };
      } else {
        if (!base.isGitRepo) return { ...base, manualReason: "Development updates require a Git checkout." };
        base.localSha = await git("rev-parse", "HEAD");
        base.remoteSha = await resolve(channel);
        await git("fetch", "--quiet", "--no-tags", "--no-write-fetch-head", remote, base.remoteSha);
        base.behind = Number(await git("rev-list", "--count", `HEAD..${base.remoteSha}`));
        // HEAD can advance before a build fails. Keep the advertised update available
        // until the running build catches up, including after a browser reload.
        const buildBehind = !!options.buildSha && !base.localSha.startsWith(options.buildSha);
        base.updateAvailable = base.behind > 0 || (buildBehind && base.localSha === base.remoteSha);
        base.target = { channel, sha: base.remoteSha };
        base.manualReason = await checkoutProblem();
      }
      base.canUpdate = base.updateAvailable && !base.manualReason;
      return base;
    } catch (e) { return { ...base, canUpdate: false, error: (e as Error).message }; }
  }
  async function update(target: UpdateTarget): Promise<UpdateResult> {
    if (updating) throw new Error("An update is already running.");
    updating = true;
    try {
      if (!target || !["stable", "development"].includes(target.channel) || !/^[a-f0-9]{40}$/.test(target.sha) ||
          (target.channel === "stable" && (!target.tag || !tagPattern.test(target.tag)))) throw new Error("Invalid update target. Check for updates again.");
      if (!isGit()) throw new Error("A Git checkout is required for in-app updates. See the release instructions.");
      const problem = await checkoutProblem(); if (problem) throw new Error(problem);
      if (target.channel === "stable") {
        await releaseTag(target.tag);
        if (!newer(target.tag!, version)) throw new Error("This release is not newer than the running version.");
      }
      const resolved = await resolve(target.channel, target.tag);
      if (resolved !== target.sha) throw new Error("The advertised update target changed. Check for updates again.");
      await git("fetch", "--quiet", "--no-tags", "--no-write-fetch-head", remote, target.sha);
      if (target.channel === "stable") {
        const manifest = JSON.parse(await git("show", `${target.sha}:package.json`));
        if (manifest.name !== "bead-me-up-scotty" || manifest.version !== target.tag!.replace(/^v/, "")) throw new Error("Release tag and package version do not match.");
      }
      const fromSha = await git("rev-parse", "HEAD");
      try { await git("merge-base", "--is-ancestor", fromSha, target.sha); }
      catch { throw new Error("Your checkout has diverged from this update. A fast-forward is required; no local work was overwritten."); }
      // Recheck after network requests, before changing tracked files.
      const recheck = await checkoutProblem(); if (recheck) throw new Error(recheck);
      if (await git("rev-parse", "HEAD") !== fromSha) throw new Error("The checkout changed while preparing the update. Try again.");
      const steps: UpdateStep[] = [];
      const run = async (name: string, command: string, args: string[]) => {
        try { const output = await runner(command, args, { cwd, timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
          steps.push({ name, ok: true, output: `${output.stdout}${output.stderr}`.slice(-4000) });
        } catch { throw new Error(`${name} failed. Source files may already be updated; fix the problem and retry, or rebuild manually.`); }
      };
      await run("Install selected source version", "git", ["merge", "--ff-only", target.sha]);
      const toSha = await git("rev-parse", "HEAD");
      if (toSha !== target.sha) throw new Error("The checkout does not match the selected update.");
      // Always install locked dependencies: this also repairs retries after a failed build/install.
      await run("Install dependencies", "npm", ["ci", "--include=dev", "--no-audit", "--no-fund"]);
      await run("Build app", "npm", ["run", "build"]);
      restartPending = !!options.supervised;
      return { ok: true, steps, restarting: restartPending, fromSha, toSha };
    } finally { if (!restartPending) updating = false; }
  }
  return { check, update };
}
