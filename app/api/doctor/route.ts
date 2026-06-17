import { getStore } from "@/lib/store";
import { getConfig } from "@/lib/config";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = await getStore();
    const cfg = getConfig();
    const info = await store.doctor();
    return ok({ ...info, config: cfg });
  } catch (e) {
    return fail(e);
  }
}
