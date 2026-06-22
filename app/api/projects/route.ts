import fs from "node:fs";
import path from "node:path";
import { listProjects, addProject, DEMO_PROJECT } from "@/lib/config";
import type { ProjectEntry, DemoProject } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

function annotate(p: ProjectEntry | DemoProject) {
  let hasBeads = true;
  if (p.path !== null) {
    try {
      hasBeads = fs.existsSync(path.join(p.path, ".beads"));
    } catch {
      hasBeads = false;
    }
  }
  return { ...p, hasBeads };
}

export async function GET() {
  const projects = [DEMO_PROJECT, ...listProjects()].map(annotate);
  return ok({ projects });
}

const addSchema = z.object({ path: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const { path: inputPath } = addSchema.parse(await req.json());
    const entry = addProject(inputPath);
    return ok(entry, 201);
  } catch (e) {
    return fail(e);
  }
}
