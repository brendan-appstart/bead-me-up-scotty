/**
 * Server init hook (runs once per Next.js server instance).
 *
 * The Node-only error handling lives in ./instrumentation-node and is imported
 * lazily, only under the Node runtime, so Turbopack doesn't flag `process.on`
 * when it analyzes this file for the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
