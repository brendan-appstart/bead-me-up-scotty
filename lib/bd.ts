import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  beadSchema,
  unwrapEnvelope,
  type Bead,
  type CreateInput,
  type UpdateInput,
  type DepType,
} from "./schema";
import type { BeadsStore, DoctorInfo } from "./store";

const pExecFile = promisify(execFile);
const BD_BIN = process.env.BD_BIN || "bd";

export class BdError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "BdError";
    this.code = code;
  }
}

/**
 * Run a bd command. Args are passed as an array (no shell) so titles and
 * descriptions are injection-safe. Always requests the JSON envelope.
 */
async function runBdRaw(
  args: string[],
  opts: { repoPath: string; actor?: string },
): Promise<string> {
  try {
    const { stdout } = await pExecFile(BD_BIN, args, {
      cwd: opts.repoPath,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        BD_JSON_ENVELOPE: "1",
        ...(opts.actor ? { BEADS_ACTOR: opts.actor } : {}),
      },
    });
    return stdout;
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    // bd emits a JSON error object to stderr with a `code` when --json is active.
    const stderr = (e.stderr || "").trim();
    try {
      const parsed = JSON.parse(stderr) as { error?: string; code?: string };
      if (parsed.error) throw new BdError(parsed.error, parsed.code);
    } catch (parseErr) {
      if (parseErr instanceof BdError) throw parseErr;
    }
    throw new BdError(stderr || e.message || "bd command failed");
  }
}

async function runBdJson<T = unknown>(
  args: string[],
  opts: { repoPath: string; actor?: string },
): Promise<T> {
  const out = await runBdRaw([...args, "--json"], opts);
  return unwrapEnvelope(JSON.parse(out)) as T;
}

/** Parse `bd export --json` JSONL output into validated beads. */
function parseExport(jsonl: string): Bead[] {
  const beads: Bead[] = [];
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const parsed = beadSchema.safeParse(obj);
    // Skip memory/non-issue records (they lack required issue fields).
    if (parsed.success && parsed.data.issue_type) beads.push(parsed.data);
  }
  return beads;
}

// ---- bd serialization (embedded Dolt is single-writer *per database*) ----
// EVERY bd invocation — including read-only `export`/`show` — rewrites the
// embedded-Dolt store, so reads MUST serialize with writes too. Running them
// concurrently corrupts persists ("Unable to write SST file …") and collides on
// compaction ("Another write batch or compaction is already active").
// Keyed by repoPath so same-project bd calls serialize while different projects
// run in parallel.
const writeChains = new Map<string, Promise<unknown>>();
function serializeWrite<T>(repoPath: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeChains.get(repoPath) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  writeChains.set(
    repoPath,
    next.catch(() => {}),
  );
  return next;
}

const availabilityCache = new Map<string, boolean>();

export async function isBdAvailable(repoPath: string): Promise<boolean> {
  const hit = availabilityCache.get(repoPath);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    await pExecFile(BD_BIN, ["--version"], { timeout: 5000 });
    ok = fs.existsSync(path.join(repoPath, ".beads"));
  } catch {
    ok = false;
  }
  availabilityCache.set(repoPath, ok);
  return ok;
}

export function createBdStore(repoPath: string): BeadsStore {
  const ro = { repoPath };
  const rw = (actor: string) => ({ repoPath, actor });
  // Collapse concurrent list() callers (the polling views) onto one in-flight export.
  let inflightList: Promise<Bead[]> | null = null;

  async function show(id: string): Promise<Bead> {
    // bd 1.0.5 `show <id> --json` returns its envelope `data` as an ARRAY even
    // for a single id, while beadSchema expects one object. Unwrap before parse.
    const data = await runBdJson(["show", id], ro);
    const rec = Array.isArray(data) ? data[0] : data;
    if (!rec) throw new BdError(`bead ${id} not found`, "not_found");
    const parsed = beadSchema.safeParse(rec);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new BdError(`could not parse bead ${id}: ${detail}`, "parse_error");
    }
    return parsed.data;
  }

  return {
    kind: "bd",

    async list() {
      // Dedupe concurrent callers onto one in-flight export, and serialize that
      // export with all other bd ops so reads can't collide with writes/compaction.
      if (inflightList) return inflightList;
      inflightList = serializeWrite(repoPath, async () =>
        parseExport(await runBdRaw(["export", "--json"], ro)),
      );
      try {
        return await inflightList;
      } finally {
        inflightList = null;
      }
    },

    async get(id) {
      // Serialized too — `bd show` rewrites the store like any other invocation.
      return serializeWrite(repoPath, async () => {
        try {
          return await show(id);
        } catch (e) {
          if (e instanceof BdError && e.code === "not_found") return null;
          throw e;
        }
      });
    },

    create(input: CreateInput, actor: string) {
      return serializeWrite(repoPath, async () => {
        const args = [
          "create",
          input.title,
          "-t",
          input.issue_type,
          "--priority",
          String(input.priority),
        ];
        if (input.description) args.push("--description", input.description);
        if (input.assignee) args.push("--assignee", input.assignee);
        if (input.labels?.length) args.push("-l", input.labels.join(","));
        if (input.parent) args.push("--parent", input.parent);
        const created = await runBdJson<{ id: string }>(args, rw(actor));
        const id = created.id;
        if (input.backlog) {
          await runBdRaw(["update", id, "-s", "deferred"], rw(actor));
        }
        return show(id);
      });
    },

    update(id, patch: UpdateInput, actor: string) {
      return serializeWrite(repoPath, async () => {
        const args = ["update", id];
        if (patch.title !== undefined) args.push("--title", patch.title);
        if (patch.description !== undefined) args.push("--description", patch.description);
        if (patch.status !== undefined) args.push("-s", patch.status);
        if (patch.priority !== undefined) args.push("--priority", String(patch.priority));
        if (patch.issue_type !== undefined) args.push("-t", patch.issue_type);
        if (patch.assignee !== undefined) args.push("--assignee", patch.assignee);
        await runBdRaw(args, rw(actor));
        return show(id);
      });
    },

    setStatus(id, status, actor) {
      return serializeWrite(repoPath, async () => {
        if (status === "closed") {
          await runBdRaw(["close", id], rw(actor));
        } else {
          await runBdRaw(["update", id, "-s", status], rw(actor));
        }
        return show(id);
      });
    },

    remove(id, actor) {
      return serializeWrite(repoPath, async () => {
        await runBdRaw(["delete", id, "--force"], rw(actor));
      });
    },

    addComment(id, text, actor) {
      return serializeWrite(repoPath, async () => {
        await runBdRaw(["comment", id, text], rw(actor));
        return show(id);
      });
    },

    addDep(id, dependsOnId, type: DepType, actor) {
      return serializeWrite(repoPath, async () => {
        await runBdRaw(["dep", "add", id, dependsOnId, "-t", type], rw(actor));
        return show(id);
      });
    },

    removeDep(id, dependsOnId, actor) {
      return serializeWrite(repoPath, async () => {
        await runBdRaw(["dep", "remove", id, dependsOnId], rw(actor));
        return show(id);
      });
    },

    createGate(blocks, reason, actor) {
      return serializeWrite(repoPath, async () => {
        const args = ["gate", "create", "--type", "human", "--blocks", blocks];
        if (reason) args.push("--reason", reason);
        // `bd gate create --json` returns the created gate object (incl. its id).
        const created = await runBdJson<{ id: string }>(args, rw(actor));
        return show(created.id);
      });
    },

    removeLabel(id, label, actor) {
      return serializeWrite(repoPath, async () => {
        await runBdRaw(["update", id, "--remove-label", label], rw(actor));
        return show(id);
      });
    },

    archive(id, actor) {
      return serializeWrite(repoPath, async () => {
        await runBdRaw(["close", id], rw(actor));
        await runBdRaw(["label", "add", id, "archived"], rw(actor));
        return show(id);
      });
    },

    async doctor(): Promise<DoctorInfo> {
      try {
        const { stdout } = await pExecFile(BD_BIN, ["--version"], { cwd: repoPath });
        return {
          kind: "bd",
          ok: true,
          version: stdout.trim(),
          repoPath,
          message: `Connected to bd at ${repoPath}`,
        };
      } catch (e) {
        return {
          kind: "bd",
          ok: false,
          repoPath,
          message: (e as Error).message,
        };
      }
    },
  };
}
