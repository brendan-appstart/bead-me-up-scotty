import { ok, fail } from "@/lib/api";
import { runUpdate, RESTART_EXIT_CODE } from "@/lib/self-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Apply a self-update (bead bgb): git pull → npm install (if deps changed) →
 * next build. When running under the supervised launcher (`npm run serve`), the
 * process then exits with RESTART_EXIT_CODE so the supervisor relaunches with the
 * new build. Otherwise it returns restarting:false and the UI tells the user to
 * restart manually.
 */
export async function POST() {
  try {
    const result = await runUpdate();
    if (result.restarting) {
      // Flush the response first, then exit so the supervisor relaunches.
      setTimeout(() => process.exit(RESTART_EXIT_CODE), 750);
    }
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
