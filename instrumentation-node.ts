/**
 * Node-only server hardening (imported by instrumentation.ts under the Node
 * runtime). Top-level side effects install the handlers on import.
 *
 * The SSE change stream (app/api/p/[projectId]/beads/stream) writes to a
 * long-lived socket. When a browser tab closes or reloads mid-write, the
 * runtime's flush to that dead socket can throw EPIPE/ECONNRESET *asynchronously*
 * — outside our try/catch — surfacing as an uncaughtException that takes down the
 * whole dev server. That crash made in-flight requests (e.g. saving a bead edit)
 * appear to silently fail. These are normal network teardowns, not app bugs, so
 * swallow exactly those and let every other error crash as usual.
 */
export {}; // ensure this file is treated as a module (it only has side effects)

const isBenignNetError = (e: unknown): boolean => {
  const code = (e as NodeJS.ErrnoException | undefined)?.code;
  return code === "EPIPE" || code === "ECONNRESET" || code === "ERR_STREAM_DESTROYED";
};

process.on("uncaughtException", (err) => {
  if (isBenignNetError(err)) {
    console.warn(`[instrumentation] ignored benign network error: ${err.message}`);
    return;
  }
  // Not ours to swallow — re-throw to preserve Node's default crash behavior.
  throw err;
});

process.on("unhandledRejection", (reason) => {
  if (isBenignNetError(reason)) {
    console.warn("[instrumentation] ignored benign network rejection");
    return;
  }
  throw reason;
});
