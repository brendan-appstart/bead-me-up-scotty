import { NextResponse } from "next/server";
import { z } from "zod";
import { isReadOnly, VIEWER_MODE_COOKIE } from "@/lib/config";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", Vary: "Cookie" };
const input = z.object({ readOnly: z.boolean() });

export function GET(req: Request) {
  return NextResponse.json({ readOnly: isReadOnly(req) }, { headers });
}

export async function PUT(req: Request) {
  // A foreign website must not silently change the user's editing preference.
  const origin = req.headers.get("origin");
  // Next may use its internal listening hostname in req.url. Host is the
  // authority the browser addressed (e.g. 127.0.0.1 rather than localhost).
  const url = new URL(req.url);
  const host = req.headers.get("host") ?? url.host;
  if (origin && origin !== `${url.protocol}//${host}`) {
    return NextResponse.json({ error: "Origin mismatch" }, { status: 403 });
  }
  try {
    const { readOnly } = input.parse(await req.json());
    const res = NextResponse.json({ readOnly }, { headers });
    res.cookies.set(VIEWER_MODE_COOKIE, readOnly ? "read-only" : "editing", {
      httpOnly: true, sameSite: "strict", path: "/",
      secure: new URL(req.url).protocol === "https:",
      // No expires/maxAge: mode is session-scoped, unlike banner appearance.
    });
    return res;
  } catch (e) { return fail(e); }
}
