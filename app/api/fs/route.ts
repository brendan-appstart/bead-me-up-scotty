import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Read-only filesystem browser used by the "add project" folder picker.
 *
 * SECURITY: this exposes the server's directory tree to anyone who can reach it.
 * That is acceptable for a localhost, single-user dev tool (same trust model as
 * the existing `bd` shell-out) — do NOT expose this app to untrusted networks
 * without auth. Set BEADS_FS_ROOT to clamp browsing to a subtree.
 */
function hasBeads(p: string): boolean {
  try {
    return fs.existsSync(path.join(p, ".beads"));
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const home = os.homedir();
    const root = process.env.BEADS_FS_ROOT ? path.resolve(process.env.BEADS_FS_ROOT) : null;
    const rawRequested = url.searchParams.get("path");
    // Expand a leading ~ so typed/pasted home-relative paths resolve.
    const requested =
      rawRequested === "~"
        ? home
        : rawRequested?.startsWith("~/")
          ? path.join(home, rawRequested.slice(2))
          : rawRequested;
    const target = path.resolve(requested && requested.trim() ? requested : root || home);

    if (root && target !== root && !target.startsWith(root + path.sep)) {
      return ok({ error: "Path is outside the allowed root", code: "eacces" }, 403);
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        return ok({ error: `Not found: ${target}`, code: "enoent" }, 400);
      }
      if (code === "EACCES") {
        return ok({ error: `Permission denied: ${target}`, code: "eacces" }, 403);
      }
      throw e;
    }
    if (!stat.isDirectory()) {
      return ok({ error: `Not a directory: ${target}`, code: "enotdir" }, 400);
    }

    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(target, { withFileTypes: true });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EACCES") {
        return ok({ error: `Permission denied: ${target}`, code: "eacces" }, 403);
      }
      throw e;
    }

    const entries = dirents
      .filter((d) => {
        if (d.name.startsWith(".")) return false; // hide dotfolders
        if (d.isDirectory()) return true;
        if (d.isSymbolicLink()) {
          try {
            return fs.statSync(path.join(target, d.name)).isDirectory();
          } catch {
            return false;
          }
        }
        return false;
      })
      .map((d) => {
        const full = path.join(target, d.name);
        return { name: d.name, path: full, hasBeads: hasBeads(full) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const parent = path.dirname(target);
    const parentAllowed = !root || target !== root;

    return ok({
      path: target,
      parent: parent === target || !parentAllowed ? null : parent,
      home: root || home,
      hasBeads: hasBeads(target),
      entries,
    });
  } catch (e) {
    return fail(e);
  }
}
