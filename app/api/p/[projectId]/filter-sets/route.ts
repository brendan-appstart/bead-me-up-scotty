import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addFilterSet,
  ConfigError,
  deleteFilterSet,
  getFilterSets,
  renameFilterSet,
} from "@/lib/config";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

const snapshotSchema = z.object({
  status: z.array(z.string()),
  type: z.array(z.string()),
  priority: z.array(z.number()),
  origin: z.array(z.string()),
  labels: z.array(z.string()),
  assignee: z.array(z.string()),
  epic: z.array(z.string()),
  search: z.string(),
  archived: z.boolean(),
});

const createSchema = z.object({
  name: z.string().min(1),
  snapshot: snapshotSchema,
  overwrite: z.boolean().optional(),
});

const renameSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

function conflict(err: ConfigError) {
  return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
}

function notFound(err: ConfigError) {
  return NextResponse.json({ error: err.message, code: err.code }, { status: 404 });
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    return ok({ sets: getFilterSets(projectId) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const { name, snapshot, overwrite } = createSchema.parse(await req.json());
    return ok({ sets: addFilterSet(projectId, name, snapshot, { overwrite }) });
  } catch (e) {
    if (e instanceof ConfigError && e.code === "duplicate_filter_set") return conflict(e);
    return fail(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const { id, name } = renameSchema.parse(await req.json());
    return ok({ sets: renameFilterSet(projectId, id, name) });
  } catch (e) {
    if (e instanceof ConfigError && e.code === "duplicate_filter_set") return conflict(e);
    if (e instanceof ConfigError && e.code === "not_found") return notFound(e);
    return fail(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const { id } = deleteSchema.parse(await req.json());
    return ok({ sets: deleteFilterSet(projectId, id) });
  } catch (e) {
    if (e instanceof ConfigError && e.code === "not_found") return notFound(e);
    return fail(e);
  }
}
