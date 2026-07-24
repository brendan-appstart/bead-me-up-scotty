#!/usr/bin/env node
/**
 * Global launcher for Bead Me Up, Scotty.
 *
 * Installed as `scotty` / `bead-me-up-scotty`. Starts the Next.js production
 * server (from this package's own prebuilt .next) on a free port, waits until
 * it's ready, then opens the browser. If you run it from a directory that
 * contains a `.beads` repo, it opens straight to that project's board.
 *
 * Zero dependencies — Node stdlib only. Works regardless of the directory it's
 * launched from (resolves the package root from this file's location, not cwd).
 */
import net from "node:net";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// The directory the user ran the command from (used for cwd auto-open).
const invocationCwd = process.cwd();

// This package's root — the dir holding package.json, .next and node_modules.
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

const require = createRequire(import.meta.url);

function printHelp() {
  console.log(`
Bead Me Up, Scotty — local web UI for the beads (bd) tracker.

Usage:
  scotty [options]
  bead-me-up-scotty [options]

Starts the server and opens your browser. Run it from a folder that has a
.beads repo to jump straight to that project; otherwise you get the picker.

Options:
  -p, --port <n>   Port to use (default 3000, or $PORT). Auto-picks a free
                   port if the default is busy; with an explicit --port it
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
    opts.port = Number.isInteger(env) && env > 0 ? env : 3000;
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

/** Resolve true if `port` can be bound on 0.0.0.0, else false. */
function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen({ port, host: "0.0.0.0" });
  });
}

/** Find a free port at/after `start`. If `explicit`, only check `start`. */
async function pickPort(start, explicit) {
  if (await portFree(start)) return start;
  if (explicit) {
    console.error(`Port ${start} is already in use. Pick another with --port.`);
    process.exit(1);
  }
  for (let p = start + 1; p <= start + 50; p++) {
    if (await portFree(p)) return p;
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
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    console.error(
      "No production build found.\n" +
        "Run `npm run build` in the project directory, then reinstall " +
        "(`npm link` or `npm install -g .`).",
    );
    process.exit(1);
  }

  const port = await pickPort(opts.port, opts.portExplicit);
  const host = opts.host;
  const nextBin = resolveNextBin();

  const child = spawn(process.execPath, [nextBin, "start", ROOT, "-p", String(port), "-H", host], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, PORT: String(port), HOST: host },
  });

  // Forward signals and clean up the child on exit.
  let shuttingDown = false;
  const forward = (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    child.kill(sig);
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
    process.exit(signal ? 128 : (code ?? 0));
  });

  try {
    await waitForReady(host, port);
  } catch {
    console.error("Server failed to start. See the output above.");
    return; // child's exit handler will set the exit code
  }

  const target = opts.open ? await targetPath(host, port) : "/";
  // Canonicalize through the URL parser — throws on anything that isn't a
  // well-formed http origin, so no raw user input reaches openBrowser().
  const fullUrl = new URL(target, `http://${host}:${port}`).href;
  console.log(`\n  Bead Me Up, Scotty → ${fullUrl}\n  (Ctrl+C to stop)\n`);
  if (opts.open) openBrowser(fullUrl);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
