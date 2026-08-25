import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getStore } from "@/lib/store";
import { ok, fail } from "@/lib/api";
import { pourPhaseSchema } from "@/lib/formulas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; name: string }> };

const bodySchema = z.object({
  vars: z.record(z.string(), z.string()).optional().default({}),
  phase: pourPhaseSchema,
  dryRun: z.boolean().optional().default(false),
});

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { projectId, name } = await params;
    const store = await getStore(projectId);
    const formula = await store.showFormula(name);
    if (!formula) {
      return NextResponse.json(
        { error: `formula not found: ${name}`, code: "not_found" },
        { status: 404 },
      );
    }
    const body = bodySchema.parse(await req.json());
    return ok(await store.pourFormula({ name, ...body }));
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
