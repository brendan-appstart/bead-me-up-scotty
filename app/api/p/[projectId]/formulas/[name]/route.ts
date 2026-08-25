import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; name: string }> };

export async function GET(_req: Request, { params }: Ctx) {
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
    return ok(formula);
  } catch (e) {
    return fail(e);
  }
}
