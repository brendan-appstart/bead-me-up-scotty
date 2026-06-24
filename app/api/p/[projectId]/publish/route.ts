import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import { z } from "zod";
import { buildShowcase, type ShowcaseTemplate } from "@/lib/showcase/generate";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectId: string }> };
const pExecFile = promisify(execFile);

const buildSchema = z.object({
  action: z.literal("build").default("build"),
  template: z.enum(["manager", "timeline", "portfolio"]).default("manager"),
  title: z.string().min(1).max(120).default("Look at my productivity 😄"),
  scope: z.enum(["project", "all"]).default("project"),
  stats: z.boolean().default(true),
  search: z.boolean().default(true),
  gamification: z.boolean().default(false),
  open: z.boolean().default(true),
});
const pathSchema = z.object({ action: z.enum(["open", "deploy"]), path: z.string().min(1) });

/** Open a file/URL in the user's default browser (local single-user tool). */
async function openLocal(target: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", '""', target] : [target];
  await pExecFile(cmd, args).catch(() => {});
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.action === "open" || body.action === "deploy") {
      const { action, path: p } = pathSchema.parse(body);
      if (!fs.existsSync(p)) return ok({ error: "Build not found — generate the site first.", code: "not_found" }, 400);
      if (action === "open") {
        await openLocal(p);
        return ok({ opened: true });
      }
      // deploy: best-effort via the Vercel CLI (preview). Degrade with instructions.
      try {
        const { stdout } = await pExecFile("vercel", ["deploy", p, "--yes"], { maxBuffer: 16 * 1024 * 1024 });
        const url = (stdout.match(/https?:\/\/\S+/) || [])[0] || stdout.trim();
        return ok({ deployed: true, url });
      } catch (e) {
        return ok(
          {
            deployed: false,
            error:
              "Couldn't deploy automatically. Make sure the Vercel CLI is installed and you're logged in (`vercel login`), or deploy the folder manually.",
            hint: `vercel deploy "${p}" --yes`,
            detail: (e as { stderr?: string; message?: string }).stderr || (e as Error).message,
          },
          200,
        );
      }
    }

    const opts = buildSchema.parse(body);
    const res = await buildShowcase({
      projectId,
      template: opts.template as ShowcaseTemplate,
      title: opts.title,
      scope: opts.scope,
      stats: opts.stats,
      search: opts.search,
      gamification: opts.gamification,
    });
    if (opts.open) await openLocal(res.indexPath);
    return ok({ outDir: res.outDir, indexPath: res.indexPath, count: res.count });
  } catch (e) {
    return fail(e);
  }
}
