import "server-only";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { getProject, DEMO_PROJECT } from "./config";

/**
 * Per-project filesystem watcher registry.
 *
 * Beads has no native change-notification mechanism. Every `bd` *write* updates
 * a top-level marker file in the project's `.beads/` directory — `last-touched`
 * (create/update) or `interactions.jsonl` (close) — so we watch that directory
 * and push a "changed" signal to the browser over SSE instead of blind polling.
 *
 * The watch is intentionally NON-recursive. Embedded Dolt rewrites its
 * `embeddeddolt/.../noms/` manifest and journal on *every* invocation, including
 * read-only ones like `bd export` (~50 file events per read). Watching
 * recursively would let a client's own refetch (which runs `bd export`) trigger
 * another change event — a self-sustaining feedback loop. Reads never touch the
 * top-level files, so a non-recursive watch fires on writes only. (Trade-off:
 * teammate changes pulled via `bd dolt pull` churn only `noms/` and are caught
 * by the fallback poll, not this stream.)
 *
 * One `fs.watch` per project is shared across all subscribers (browser tabs)
 * via a ref-count; the watcher is torn down when the last subscriber leaves.
 * The EventEmitter is the stable fan-out, so the underlying watcher can be
 * rebuilt (e.g. after an error) without dropping existing subscribers.
 */

const CHANGE = "change";
/** Coalesce the burst of events a single `bd` write produces across noms files. */
const DEBOUNCE_MS = 200;

interface Entry {
  emitter: EventEmitter;
  watcher: fs.FSWatcher | null;
  beadsDir: string | null;
  refs: number;
  debounce: ReturnType<typeof setTimeout> | null;
}

const registry = new Map<string, Entry>();

/** Resolve the `.beads` directory to watch for a project, or null if N/A. */
function beadsDirFor(projectId: string): string | null {
  if (projectId === DEMO_PROJECT.id) return null;
  const project = getProject(projectId);
  if (!project || project.path === null) return null;
  const dir = path.join(project.path, ".beads");
  return fs.existsSync(dir) ? dir : null;
}

function startWatcher(entry: Entry) {
  if (entry.watcher || !entry.beadsDir) return;
  try {
    const watcher = fs.watch(
      entry.beadsDir,
      // Non-recursive on purpose — see the file header. Watching the embedded
      // Dolt noms/ subtree would loop, since reads churn it too.
      { recursive: false, persistent: false },
      () => {
        if (entry.debounce) clearTimeout(entry.debounce);
        entry.debounce = setTimeout(() => {
          entry.debounce = null;
          entry.emitter.emit(CHANGE);
        }, DEBOUNCE_MS);
      },
    );
    // A removed/unmounted dir surfaces here; drop the watcher so the next
    // subscribe can lazily re-establish it.
    watcher.on("error", () => {
      watcher.close();
      if (entry.watcher === watcher) entry.watcher = null;
    });
    entry.watcher = watcher;
  } catch {
    entry.watcher = null;
  }
}

/**
 * Subscribe to change events for a project's `.beads` directory.
 * Returns an unsubscribe function. When the project has no watchable `.beads`
 * directory (demo, missing path, not yet initialized), this is a no-op and the
 * client falls back to interval polling.
 */
export function subscribeBeadsChange(
  projectId: string,
  onChange: () => void,
): () => void {
  const beadsDir = beadsDirFor(projectId);
  if (!beadsDir) return () => {};

  let entry = registry.get(projectId);
  if (!entry) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0); // many tabs may subscribe to one project
    entry = { emitter, watcher: null, beadsDir, refs: 0, debounce: null };
    registry.set(projectId, entry);
  } else {
    // Path may have changed (project re-pointed); keep the latest.
    entry.beadsDir = beadsDir;
  }

  const e = entry;
  e.refs += 1;
  e.emitter.on(CHANGE, onChange);
  startWatcher(e);

  return () => {
    e.emitter.off(CHANGE, onChange);
    e.refs -= 1;
    if (e.refs <= 0) {
      if (e.debounce) clearTimeout(e.debounce);
      e.watcher?.close();
      registry.delete(projectId);
    }
  };
}
