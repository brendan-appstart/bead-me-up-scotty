import { getStore } from "@/lib/store";
import { getConfig, getProject } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { readInteractions } from "@/lib/interactions";
import { computeGamification } from "@/lib/gamification";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const store = await getStore(projectId);
    const cfg = getConfig();
    const beads = await store.list();
    const project = getProject(projectId);
    const repoPath = project && "path" in project ? project.path : null;
    const events = repoPath ? readInteractions(repoPath) : [];

    const data = computeGamification(beads, events, cfg.humanAllowlist, cfg.humanActor, Date.now());
    return ok(data);
  } catch (e) {
    return fail(e);
  }
}
