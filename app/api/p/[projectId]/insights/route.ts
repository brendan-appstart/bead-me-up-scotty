import { getStore } from "@/lib/store";
import { getConfig, getProject, defaultColumnLayout } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { readInteractions } from "@/lib/interactions";
import { computeInsights } from "@/lib/insights";
import { parseColumnLayout } from "@/lib/board-columns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const url = new URL(req.url);
    const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || 30));
    const layout = parseColumnLayout(url.searchParams.get("layout")) ?? defaultColumnLayout();

    const store = await getStore(projectId);
    const cfg = getConfig();
    const beads = await store.list();
    const project = getProject(projectId);
    const repoPath = project && "path" in project ? project.path : null;
    const events = repoPath ? readInteractions(repoPath) : [];

    const data = computeInsights(beads, events, cfg.humanAllowlist, days, Date.now(), layout);
    return ok(data);
  } catch (e) {
    return fail(e);
  }
}
