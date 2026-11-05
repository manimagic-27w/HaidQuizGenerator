import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, spellingLists } from "@/db";
import { getViewer } from "@/lib/auth";
import { cleanAssignees } from "@/lib/assign";

type Ctx = { params: Promise<{ id: string }> };

/** Hide/show a list, or change who it's assigned to. */
export async function PATCH(req: Request, { params }: Ctx) {
  const viewer = await getViewer();
  if (!viewer?.isParent) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const set: { archived?: boolean; assignedTo?: string[] } = {};
  if ("archived" in body) set.archived = !!body.archived;
  if ("assignedTo" in body) set.assignedTo = await cleanAssignees(body.assignedTo);
  if (!Object.keys(set).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  await db.update(spellingLists).set(set).where(eq(spellingLists.id, id));
  return NextResponse.json({ ok: true });
}

/** Delete a list. Past game results are kept. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const viewer = await getViewer();
  if (!viewer?.isParent) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  await db.delete(spellingLists).where(eq(spellingLists.id, id));
  return NextResponse.json({ ok: true });
}
