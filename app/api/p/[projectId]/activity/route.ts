import { getStore } from "@/lib/store";
import { getConfig, getProject, defaultColumnLayout } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { readInteractions, buildActivity } from "@/lib/interactions";
import { parseColumnLayout } from "@/lib/board-columns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

/** Recent activity for a project: status/priority transitions (from the
 *  interaction log) plus creations and comments (from the beads themselves). */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    // The column layout names the column a deferred bead moved to.
    const layout = parseColumnLayout(new URL(req.url).searchParams.get("layout")) ?? defaultColumnLayout();
    const store = await getStore(projectId);
    const cfg = getConfig();
    const beads = await store.list();

    // Demo and any project without a path have no interaction log on disk;
    // buildActivity falls back to synthesizing from bead timestamps.
    const project = getProject(projectId);
    const repoPath = project && "path" in project ? project.path : null;
    const events = repoPath ? readInteractions(repoPath) : [];

    const items = buildActivity(beads, events, cfg.humanAllowlist, layout).slice(0, 150);
    return ok({ items });
  } catch (e) {
    return fail(e);
  }
}
