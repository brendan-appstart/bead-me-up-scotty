#!/usr/bin/env node
/**
 * Global launcher for Bead Me Up, Scotty.
 *
 * Installed as `scotty` / `bead-me-up-scotty`. Starts the Next.js production
 * server (from this package's own prebuilt .next) on a free port, waits until
 * it's ready, then opens the browser. If Scotty is already running on the
 * default port, it opens that instance instead of starting another, unless
 * that instance was started with different settings. If you run it from a
 * directory that contains a `.beads` repo, it opens straight to that
 * project's board.
 *
 * Zero dependencies — Node stdlib only. Works regardless of the directory it's
 * launched from (resolves the package root from this file's location, not cwd).
 */
import net from "node:net";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { noticePortMove } from "./port-move-notice.mjs";

// The directory the user ran the command from (used for cwd auto-open).
const invocationCwd = process.cwd();

// This package's root — the dir holding package.json, .next and node_modules.
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

const require = createRequire(import.meta.url);
const PKG = require(path.join(ROOT, "package.json"));
const BUILD_ID_FILE = path.join(ROOT, ".next", "BUILD_ID");

// Unassigned by IANA and below every OS's ephemeral range, unlike 3000,
// which most JS dev servers also want.
const DEFAULT_PORT = 19847;

function printHelp() {
  console.log(`
Bead Me Up, Scotty — local web UI for the beads (bd) tracker.

Usage:
  scotty [options]
  bead-me-up-scotty [options]

Starts the server and opens your browser. Run it from a folder that has a
.beads repo to jump straight to that project; otherwise you get the picker.

Options:
  -p, --port <n>   Port to use (default 19847, or $PORT). If Scotty is
                   already running there, opens it instead of starting
                   another, or exits if it was started with different
                   settings. If another program holds the port, picks the
                   next free port and warns, since an installed Scotty app
                   only finds the default port. An explicit --port also
                   opens a Scotty already running there, but otherwise
                   fails instead of moving.
      --host <h>   Host to bind (default from Next; or $HOST).
      --no-open    Don't open a browser, just print the URL.
  -h, --help       Show this help.
`);
}

function parseArgs(argv) {
  const opts = { open: true, help: false };
  let portExplicit = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--no-open") opts.open = false;
    else if (a === "-p" || a === "--port") {
      opts.port = Number(argv[++i]);
      portExplicit = true;
    } else if (a.startsWith("--port=")) {
      opts.port = Number(a.slice("--port=".length));
      portExplicit = true;
    } else if (a === "--host") {
      opts.host = argv[++i];
    } else if (a.startsWith("--host=")) {
      opts.host = a.slice("--host=".length);
    }
  }
  opts.portExplicit = portExplicit;
  if (opts.port === undefined) {
    const env = Number(process.env.PORT);
    opts.port = Number.isInteger(env) && env > 0 ? env : DEFAULT_PORT;
  }
  opts.host = opts.host || process.env.HOST || "localhost";
  // The host ends up in a spawn() command line (browser open) and a URL;
  // restrict it to hostname/IP characters so it can't carry shell metacharacters.
  if (!/^[A-Za-z0-9.:[\]-]+$/.test(opts.host)) {
    console.error(`Invalid host: ${JSON.stringify(opts.host)}`);
    process.exit(1);
  }
  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
    console.error(`Invalid port: ${String(opts.port)} (expected 1-65535)`);
    process.exit(1);
  }
  return opts;
}

/** Resolve true if `port` can be bound on `host`, else false. */
function canBind(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen({ port, host });
  });
}

/**
 * Resolve true if `port` is free on 0.0.0.0 and on the host Next will bind.
 * `localhost` usually resolves to ::1, which a 0.0.0.0 probe can't see.
 */
async function portFree(port, host) {
  return (await canBind(port, "0.0.0.0")) && (await canBind(port, host));
}

/**
 * Resolve the running server's /api/instance info if Scotty itself answers on
 * host:port, else null. Whatever holds the port may not be Scotty, so the
 * probe gives up after 3 s or 64 KB.
 */
function probeScotty(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: "/api/instance" }, (res) => {
      let data = "";
      res.on("data", (c) => {
        data += c;
        if (data.length > 64 * 1024) req.destroy();
      });
      res.on("end", () => {
        try {
          const info = JSON.parse(data);
          resolve(info.name === PKG.name ? info : null);
        } catch {
          resolve(null);
        }
      });
    });
    const deadline = setTimeout(() => req.destroy(), 3000);
    req.on("error", () => resolve(null));
    req.on("close", () => {
      clearTimeout(deadline);
      resolve(null); // no-op if the response already resolved
    });
  });
}

// Must match the hash in app/api/instance/route.ts.
const hash = (v) => (v === undefined ? null : createHash("sha256").update(v).digest("hex").slice(0, 16));

/**
 * Exit if the running Scotty was started with different settings than this
 * launch asks for, since reusing it would silently drop them. Warn if it runs
 * an older build than the one installed.
 */
function checkReuse(info, port) {
  const differs = Object.keys(info.launch ?? {}).filter((k) => info.launch[k] !== hash(process.env[k]));
  if (differs.length) {
    console.error(
      `Scotty is already running on port ${port}, but with a different ${differs.join(", ")}.\n` +
        `Stop it first, or start another with --port.`,
    );
    process.exit(1);
  }
  if (info.buildId !== fs.readFileSync(BUILD_ID_FILE, "utf8").trim()) {
    const installed = info.version === PKG.version ? `a newer build of v${PKG.version}` : `v${PKG.version}`;
    console.warn(`Scotty v${info.version} is running, but ${installed} is installed. Restart Scotty to use it.`);
  }
}

/**
 * Find a port at/after `start` that is free or already serving Scotty. If
 * `explicit`, only check `start`. Returns `{ port, running: info }` to reuse
 * a running Scotty, with `info` from probeScotty().
 */
async function pickPort(start, explicit, host) {
  if (await portFree(start, host)) return { port: start };
  const info = await probeScotty(host, start);
  if (info) return { port: start, running: info };
  if (explicit) {
    console.error(`Port ${start} is already in use. Pick another with --port.`);
    process.exit(1);
  }
  for (let p = start + 1; p <= start + 50; p++) {
    const free = await portFree(p, host);
    const running = free ? undefined : await probeScotty(host, p);
    if (free || running) {
      console.warn(
        `Port ${start} is used by another program, so using ${p}. ` +
          `An installed Scotty app won't find this instance.`,
      );
      return { port: p, running };
    }
  }
  console.error(`Could not find a free port near ${start}.`);
  process.exit(1);
}

/** Resolve the local `next` CLI entrypoint from this package's deps. */
function resolveNextBin() {
  try {
    const pkg = require.resolve("next/package.json");
    return path.join(path.dirname(pkg), "dist", "bin", "next");
  } catch {
    console.error(
      "Could not find the 'next' package. Run `npm install` in the project first.",
    );
    process.exit(1);
  }
}

/** Poll the server until it responds, then resolve. */
function waitForReady(host, port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host, port, path: "/", timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", retry);
      req.on("timeout", () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error("Server did not become ready in time"));
      else setTimeout(tick, 250);
    };
    tick();
  });
}

/** Best-effort cross-platform browser open. Never throws. */
function openBrowser(url) {
  try {
    let cmd, args;
    if (process.platform === "darwin") {
      cmd = "open";
      args = [url];
    } else if (process.platform === "win32") {
      cmd = "cmd";
      // cmd.exe re-parses its command line, so caret-escape metacharacters —
      // otherwise a hostile URL could break out of the `start` argument.
      args = ["/c", "start", '""', url.replace(/[&|^<>]/g, "^$&")];
    } else {
      cmd = "xdg-open";
      args = [url];
    }
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* headless / no browser — the URL is printed regardless */
  }
}

/** If invoked from a .beads project, register it and return its board path. */
async function targetPath(host, port) {
  try {
    if (!fs.existsSync(path.join(invocationCwd, ".beads"))) return "/";
    const body = JSON.stringify({ path: invocationCwd });
    const entry = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host,
          port,
          path: "/api/projects",
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(e);
              }
            } else {
              reject(new Error(`add project failed (${res.statusCode})`));
            }
          });
        },
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
    return entry && entry.id ? `/p/${encodeURIComponent(entry.id)}` : "/";
  } catch {
    return "/"; // fall back to the picker
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  // A production build must already exist — we never build at runtime (the
  // global install dir may not be writable, and a build needs devDependencies).
  if (!fs.existsSync(BUILD_ID_FILE)) {
    console.error(
      "No production build found.\n" +
        "Run `npm run build` in the project directory, then reinstall " +
        "(`npm link` or `npm install -g .`).",
    );
    process.exit(1);
  }

  const host = opts.host;
  noticePortMove();
  const { port, running } = await pickPort(opts.port, opts.portExplicit, host);
  if (running) {
    checkReuse(running, port);
    await announce(host, port, opts.open, "already running");
    return;
  }
  const nextBin = resolveNextBin();

  const child = spawn(process.execPath, [nextBin, "start", ROOT, "-p", String(port), "-H", host], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, PORT: String(port), HOST: host },
  });

  // Forward signals and clean up the child on exit.
  //
  // `next start` shuts down *gracefully*: on SIGINT/SIGTERM it stops accepting
  // connections and then waits for in-flight requests to drain. Our SSE change
  // stream (app/api/p/[projectId]/beads/stream) is an in-flight request that
  // never completes on its own, so with any browser tab open the server waits
  // forever and Ctrl+C looks like it did nothing. Give the graceful path a
  // short deadline, then escalate to SIGKILL so Ctrl+C always works.
  const FORCE_KILL_AFTER_MS = 4000;
  let shuttingDown = false;
  let forceTimer = null;

  const hardKill = () => {
    if (forceTimer) clearTimeout(forceTimer);
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    process.exit(130);
  };

  const forward = (sig) => {
    if (shuttingDown) {
      hardKill(); // second Ctrl+C — don't wait out the deadline
      return;
    }
    shuttingDown = true;
    child.kill(sig);
    console.log("\n  Stopping…  (Ctrl+C again to force)");
    forceTimer = setTimeout(hardKill, FORCE_KILL_AFTER_MS);
  };

  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("exit", () => {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  });
  child.on("exit", (code, signal) => {
    if (forceTimer) clearTimeout(forceTimer);
    process.exit(signal ? 128 : (code ?? 0));
  });

  try {
    await waitForReady(host, port);
  } catch {
    console.error("Server failed to start. See the output above.");
    return; // child's exit handler will set the exit code
  }

  await announce(host, port, opts.open, "Ctrl+C to stop");
}

/** Print the URL (with the cwd project's board when opening) and open the browser. */
async function announce(host, port, open, note) {
  const target = open ? await targetPath(host, port) : "/";
  // Canonicalize through the URL parser — throws on anything that isn't a
  // well-formed http origin, so no raw user input reaches openBrowser().
  const fullUrl = new URL(target, `http://${host}:${port}`).href;
  console.log(`\n  Bead Me Up, Scotty → ${fullUrl}\n  (${note})\n`);
  if (open) openBrowser(fullUrl);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
