import { getStore } from "@/lib/store";
import { getConfig } from "@/lib/config";
import { createInputSchema } from "@/lib/schema";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const store = await getStore(projectId);
    const cfg = getConfig();
    const beads = await store.list();
    return ok({
      beads,
      meta: {
        kind: store.kind,
        humanActor: cfg.humanActor,
        humanAllowlist: cfg.humanAllowlist,
        pollIntervalMs: cfg.pollIntervalMs,
      },
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const store = await getStore(projectId);
    const cfg = getConfig();
    const input = createInputSchema.parse(await req.json());
    const bead = await store.create(input, cfg.humanActor);
    return ok(bead, 201);
  } catch (e) {
    return fail(e);
  }
}
