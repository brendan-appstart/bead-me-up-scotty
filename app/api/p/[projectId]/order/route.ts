import { z } from "zod";
import { getColumnOrders, setColumnOrder } from "@/lib/config";
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
    return ok({ orders: getColumnOrders(projectId) });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const { columnId, ids } = putSchema.parse(await req.json());
    return ok({ orders: setColumnOrder(projectId, columnId, ids) });
  } catch (e) {
    return fail(e);
  }
}
