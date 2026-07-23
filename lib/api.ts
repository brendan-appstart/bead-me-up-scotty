import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BdError } from "./bd";
import { ConfigError } from "./config";

export function ok(data: unknown, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid input", issues: err.issues, code: "invalid_input" },
      { status: 400 },
    );
  }
  if (err instanceof BdError) {
    // parse_error means bd's output drifted from our schema — a server-side
    // integration failure, not a bad client request.
    const status =
      err.code === "not_found" ? 404 : err.code === "parse_error" ? 500 : 400;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  if (err instanceof ConfigError) {
    const status = err.code === "unknown_project" ? 404 : 400;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  const message = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json({ error: message }, { status: 500 });
}
