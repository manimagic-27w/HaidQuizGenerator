import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, quizzes } from "@/db";
import { getViewer } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Hide or show a quiz on the student's list. */
export async function PATCH(req: Request, { params }: Ctx) {
  const viewer = await getViewer();
  if (!viewer?.isParent) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await db.update(quizzes).set({ archived: !!body.archived }).where(eq(quizzes.id, id));
  return NextResponse.json({ ok: true });
}

/** Delete a quiz. Past attempts keep their scores and time stats. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const viewer = await getViewer();
  if (!viewer?.isParent) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  await db.delete(quizzes).where(eq(quizzes.id, id));
  return NextResponse.json({ ok: true });
}
