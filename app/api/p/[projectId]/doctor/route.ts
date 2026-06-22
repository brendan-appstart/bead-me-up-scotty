import { getStore } from "@/lib/store";
import { getConfig, getProject } from "@/lib/config";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const store = await getStore(projectId);
    const cfg = getConfig();
    const project = getProject(projectId);
    const info = await store.doctor();
    return ok({
      ...info,
      project: project ? { id: project.id, name: project.name, path: project.path } : null,
      config: cfg,
    });
  } catch (e) {
    return fail(e);
  }
}
