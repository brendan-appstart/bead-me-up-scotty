import { getStore } from "@/lib/store";
import { getConfig } from "@/lib/config";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  try {
    const { projectId, id } = await params;
    const store = await getStore(projectId);
    const cfg = getConfig();
    const bead = await store.archive(id, cfg.humanActor);
    return ok(bead);
  } catch (e) {
    return fail(e);
  }
}
