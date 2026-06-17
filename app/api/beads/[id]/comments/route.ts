import { getStore } from "@/lib/store";
import { getConfig } from "@/lib/config";
import { addCommentSchema } from "@/lib/schema";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = await getStore();
    const cfg = getConfig();
    const { text } = addCommentSchema.parse(await req.json());
    const bead = await store.addComment(id, text, cfg.humanActor);
    return ok(bead);
  } catch (e) {
    return fail(e);
  }
}
