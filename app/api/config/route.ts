import { getConfig, saveConfig } from "@/lib/config";
import { resetStore } from "@/lib/store";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  repoPath: z.string().optional(),
  humanActor: z.string().optional(),
  humanAllowlist: z.array(z.string()).optional(),
  pollIntervalMs: z.number().int().min(1000).max(300000).optional(),
  demo: z.boolean().optional(),
});

export async function GET() {
  return ok(getConfig());
}

export async function PUT(req: Request) {
  try {
    const patch = patchSchema.parse(await req.json());
    const next = saveConfig(patch);
    resetStore(); // re-pick bd vs demo on next request
    return ok(next);
  } catch (e) {
    return fail(e);
  }
}
