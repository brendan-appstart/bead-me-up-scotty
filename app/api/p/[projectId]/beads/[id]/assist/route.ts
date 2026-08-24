import { getStore } from "@/lib/store";
import { getConfig, getProject } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { assistBead } from "@/lib/ai";
import { AI_PROVIDER_IDS } from "@/lib/ai-providers";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; id: string }> };

const bodySchema = z.object({
  provider: z.enum(AI_PROVIDER_IDS).optional(),
});

/** Refine/triage a bead with a local coding CLI. Read-only — returns
 *  suggestions; the client applies them only on explicit confirmation. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { projectId, id } = await params;
    const raw = await req.text();
    const body = bodySchema.parse(raw ? JSON.parse(raw) : {});
    const cfg = getConfig();
    const provider = body.provider ?? cfg.aiProvider;
    const project = getProject(projectId);
    const cwd = project?.path ?? undefined;

    const store = await getStore(projectId);
    const beads = await store.list();
    const bead = beads.find((b) => b.id === id);
    if (!bead) return fail(new Error(`Unknown bead: ${id}`));

    const result = await assistBead({
      id: bead.id,
      title: bead.title,
      description: bead.description ?? "",
      type: bead.issue_type,
      labels: bead.labels ?? [],
      others: beads.filter((b) => b.id !== id).map((b) => ({ id: b.id, title: b.title })),
      provider,
      cwd,
    });
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
