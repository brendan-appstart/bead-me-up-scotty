import path from "node:path";
import os from "node:os";
import { createTelemetry } from "@/lib/telemetry";
import { version } from "@/package.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const telemetry = createTelemetry({
  file: path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "bead-me-up-scotty", "telemetry.json"),
  key: process.env.POSTHOG_KEY || "",
  host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
  version,
});

function sameOrigin(req: Request) {
  const url = new URL(req.url);
  // Next may use the listening hostname internally; compare the browser-facing Host.
  const host = req.headers.get("host") ?? url.host;
  return req.headers.get("origin") === `${url.protocol}//${host}`;
}

export function GET() {
  return Response.json(telemetry.settings());
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return new Response(null, { status: 403 });
  try {
    const body = await req.json();
    if (typeof body?.enabled !== "boolean") return new Response(null, { status: 400 });
    return Response.json(telemetry.setEnabled(body.enabled));
  } catch {
    return Response.json({ error: "Could not save usage preference." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response(null, { status: 403 });
  // Deliberately ignore the body and headers: never relay browser/project data.
  await telemetry.capture();
  return new Response(null, { status: 204 });
}
