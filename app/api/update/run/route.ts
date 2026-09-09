import { ok, fail } from "@/lib/api";
import { runUpdate, RESTART_EXIT_CODE } from "@/lib/self-update";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const targetSchema = z.object({ channel: z.enum(["stable", "development"]), sha: z.string().regex(/^[a-f0-9]{40}$/), tag: z.string().max(100).optional() });
export async function POST(request: Request) {
  try {
    const result = await runUpdate(targetSchema.parse(await request.json()));
    if (result.restarting) setTimeout(() => process.exit(RESTART_EXIT_CODE), 750);
    return ok(result);
  } catch (e) { return fail(e); }
}
