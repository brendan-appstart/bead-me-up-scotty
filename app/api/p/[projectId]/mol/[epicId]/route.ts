import { getStore } from "@/lib/store";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; epicId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { projectId, epicId } = await params;
    const store = await getStore(projectId);
    const [show, progress] = await Promise.all([
      store.molShow(epicId),
      store.molProgress(epicId),
    ]);
    return ok({ show: show ?? null, progress });
  } catch (e) {
    return fail(e);
  }
}
