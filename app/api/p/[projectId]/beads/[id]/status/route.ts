import { getStore } from "@/lib/store";
import { getConfig } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { z } from "zod";
import { BEAD_STATUSES } from "@/lib/schema";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ status: z.enum(BEAD_STATUSES) });

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  try {
    const { projectId, id } = await params;
    const store = await getStore(projectId);
    const cfg = getConfig();
    const { status } = bodySchema.parse(await req.json());
    const bead = await store.setStatus(id, status, cfg.humanActor);
    return ok(bead);
  } catch (e) {
    return fail(e);
  }
}
