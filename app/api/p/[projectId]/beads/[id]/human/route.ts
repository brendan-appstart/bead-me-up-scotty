import { getStore } from "@/lib/store";
import { getConfig } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { isHumanQuestion } from "@/lib/beads-view";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; id: string }> };

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("respond"), text: z.string().min(1) }),
  z.object({ action: z.literal("dismiss") }),
]);

/**
 * Act on a "Needs You" (human-labelled) bead:
 *  - respond → post a comment answering the agent's question, then clear the
 *    `human` flag so it leaves the inbox. Status is left UNCHANGED so the agent
 *    can read the answer and keep working (bead 0p0). This intentionally differs
 *    from `bd human respond`, which also closes the bead.
 *  - dismiss → remove the `human` label so it leaves the inbox.
 *
 * A bead labelled `human-question` exists only to get the answer, so both
 * actions do exactly what `bd human respond` / `bd human dismiss` do instead:
 * close it with reason "Responded" / "Dismissed" and keep the `human` label.
 * The beads that wait on it become ready, as after the CLI (#88).
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { projectId, id } = await params;
    const store = await getStore(projectId);
    const cfg = getConfig();
    const body = bodySchema.parse(await req.json());

    // The bead's own label decides, never the client: a stale card can't close it.
    const current = await store.get(id);
    if (current && isHumanQuestion(current)) {
      const bead = body.action === "respond"
        ? await store.respondHuman(id, body.text, cfg.humanActor)
        : await store.dismissHuman(id, cfg.humanActor);
      return ok(bead);
    }

    if (body.action === "respond") {
      await store.addComment(id, body.text, cfg.humanActor);
      const bead = await store.removeLabel(id, "human", cfg.humanActor);
      return ok(bead);
    }
    const bead = await store.removeLabel(id, "human", cfg.humanActor);
    return ok(bead);
  } catch (e) {
    return fail(e);
  }
}
