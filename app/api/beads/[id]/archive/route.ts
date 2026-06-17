import { getStore } from "@/lib/store";
import { getConfig } from "@/lib/config";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = await getStore();
    const cfg = getConfig();
    const bead = await store.archive(id, cfg.humanActor);
    return ok(bead);
  } catch (e) {
    return fail(e);
  }
}
