import { removeProject, renameProject } from "@/lib/config";
import { resetStore } from "@/lib/store";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    removeProject(id);
    resetStore(id);
    return ok({ removed: id });
  } catch (e) {
    return fail(e);
  }
}

const renameSchema = z.object({ name: z.string().min(1) });

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { name } = renameSchema.parse(await req.json());
    const entry = renameProject(id, name);
    if (!entry) return ok({ error: "not found" }, 404);
    return ok(entry);
  } catch (e) {
    return fail(e);
  }
}
