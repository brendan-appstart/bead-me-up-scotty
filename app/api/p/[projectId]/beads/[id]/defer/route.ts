import { getStore } from "@/lib/store";
import { getConfig } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  until: z.string().trim().min(1).max(500),
  reason: z.string().max(10_000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  try {
    const { projectId, id } = await params;
    const store = await getStore(projectId);
    const cfg = getConfig();
    const { until, reason } = bodySchema.parse(await req.json());
    const bead = await store.defer(id, until, cfg.humanActor, reason);
    return ok(bead);
  } catch (e) {
    return fail(e);
  }
}
