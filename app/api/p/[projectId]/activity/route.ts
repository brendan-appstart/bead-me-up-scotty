import { getStore } from "@/lib/store";
import { getConfig, getProject } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { readInteractions, buildActivity } from "@/lib/interactions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

/** Recent activity for a project: status/priority transitions (from the
 *  interaction log) plus creations and comments (from the beads themselves). */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const store = await getStore(projectId);
    const cfg = getConfig();
    const beads = await store.list();

    // Demo and any project without a path have no interaction log on disk;
    // buildActivity falls back to synthesizing from bead timestamps.
    const project = getProject(projectId);
    const repoPath = project && "path" in project ? project.path : null;
    const events = repoPath ? readInteractions(repoPath) : [];

    const items = buildActivity(beads, events, cfg.humanAllowlist).slice(0, 150);
    return ok({ items });
  } catch (e) {
    return fail(e);
  }
}
