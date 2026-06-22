import { getConfig, saveConfig } from "@/lib/config";
import { resetStore } from "@/lib/store";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  humanActor: z.string().optional(),
  humanAllowlist: z.array(z.string()).optional(),
  pollIntervalMs: z.number().int().min(1000).max(300000).optional(),
});

export async function GET() {
  return ok(getConfig());
}

export async function PUT(req: Request) {
  try {
    const patch = patchSchema.parse(await req.json());
    const next = saveConfig(patch);
    // Actor changes affect write attribution; drop cached stores so the next
    // write picks up the new value.
    resetStore();
    return ok(next);
  } catch (e) {
    return fail(e);
  }
}
