import { ok, fail } from "@/lib/api";
import { checkForUpdate } from "@/lib/self-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Is the app's clone behind origin/main? (bead bgb) Read-only: only `git fetch`. */
export async function GET() {
  try {
    return ok(await checkForUpdate());
  } catch (e) {
    return fail(e);
  }
}
