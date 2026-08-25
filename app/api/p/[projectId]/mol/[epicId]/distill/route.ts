import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getStore } from "@/lib/store";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; epicId: string }> };

const bodySchema = z.object({
  name: z.string().min(1),
  vars: z.record(z.string(), z.string()).optional().default({}),
});

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { projectId, epicId } = await params;
    const store = await getStore(projectId);
    const body = bodySchema.parse(await req.json());
    return ok(await store.distillMol({ epicId, name: body.name, vars: body.vars }));
  } catch (e) {
    if (e instanceof ZodError) {
      const first = e.issues[0]?.message;
      return NextResponse.json(
        { error: first || "Invalid input", code: "invalid_input", issues: e.issues },
        { status: 400 },
      );
    }
    return fail(e);
  }
}
