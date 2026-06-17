import { getStore } from "@/lib/store";
import { getConfig } from "@/lib/config";
import { updateInputSchema } from "@/lib/schema";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const store = await getStore();
    const bead = await store.get(id);
    if (!bead) return ok({ error: "not found" }, 404);
    return ok(bead);
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const store = await getStore();
    const cfg = getConfig();
    const patch = updateInputSchema.parse(await req.json());
    const bead = await store.update(id, patch, cfg.humanActor);
    return ok(bead);
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const store = await getStore();
    const cfg = getConfig();
    await store.remove(id, cfg.humanActor);
    return ok({ deleted: id });
  } catch (e) {
    return fail(e);
  }
}
