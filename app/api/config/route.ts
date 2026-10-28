import { DEMO_PROJECT, getConfig, isReadOnly, orderStoreOf, saveConfig } from "@/lib/config";
import { copyAllLocalOrders } from "@/lib/order-store";
import { getStore, resetStore } from "@/lib/store";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  humanActor: z.string().optional(),
  humanAllowlist: z.array(z.string()).optional(),
  pollIntervalMs: z.number().int().min(1000).max(300000).optional(),
  gamification: z.boolean().optional(),
  orderStore: z.enum(["local", "beads"]).optional(),
});

export async function GET() {
  return ok(getConfig());
}

export async function PUT(req: Request) {
  try {
    const patch = patchSchema.parse(await req.json());
    const switchedToBeads = patch.orderStore === "beads" && orderStoreOf(getConfig()) !== "beads";
    const next = saveConfig(patch);
    // Copy the saved local order into beads metadata as the setting flips on.
    // Read-only mode never writes beads; the copy then waits for the next order write.
    if (switchedToBeads && !isReadOnly(req)) {
      await copyAllLocalOrders(
        [DEMO_PROJECT.id, ...next.projects.map((p) => p.id)].map((id) => ({
          id,
          store: () => getStore(id),
        })),
        next.humanActor,
      );
    }
    // Actor changes affect write attribution; drop cached stores so the next
    // write picks up the new value.
    resetStore();
    return ok(next);
  } catch (e) {
    return fail(e);
  }
}
