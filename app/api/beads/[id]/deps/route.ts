import { getStore } from "@/lib/store";
import { getConfig } from "@/lib/config";
import { addDepSchema } from "@/lib/schema";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = await getStore();
    const cfg = getConfig();
    const { depends_on_id, type } = addDepSchema.parse(await req.json());
    const bead = await store.addDep(id, depends_on_id, type, cfg.humanActor);
    return ok(bead);
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = await getStore();
    const cfg = getConfig();
    const { depends_on_id } = z.object({ depends_on_id: z.string() }).parse(await req.json());
    const bead = await store.removeDep(id, depends_on_id, cfg.humanActor);
    return ok(bead);
  } catch (e) {
    return fail(e);
  }
}
