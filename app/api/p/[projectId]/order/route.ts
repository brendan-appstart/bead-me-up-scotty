import { z } from "zod";
import { getConfig } from "@/lib/config";
import { getColumnOrders, setColumnOrder } from "@/lib/order-store";
import { getStore } from "@/lib/store";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

const putSchema = z.object({
  columnId: z.string().min(1),
  ids: z.array(z.string()),
});

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    return ok({ orders: await getColumnOrders(projectId, () => getStore(projectId)) });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const { columnId, ids } = putSchema.parse(await req.json());
    const cfg = getConfig();
    return ok({
      orders: await setColumnOrder(projectId, columnId, ids, () => getStore(projectId), cfg.humanActor),
    });
  } catch (e) {
    return fail(e);
  }
}
