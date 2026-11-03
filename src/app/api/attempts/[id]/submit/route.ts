import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, attempts, attemptAnswers, questions } from "@/db";
import { getViewer } from "@/lib/auth";
import { ownOpenAttempt, progressSchema, saveProgress } from "@/lib/attempts";

type Ctx = { params: Promise<{ id: string }> };

/** Save the final answers and grade them on the server, where the answer key lives. */
export async function POST(req: Request, { params }: Ctx) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in again to submit." }, { status: 401 });
  const { id } = await params;
  const attempt = await ownOpenAttempt(id, viewer.id);
  if (!attempt) return NextResponse.json({ error: "This quiz was already submitted." }, { status: 409 });
  const parsed = progressSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad answer data." }, { status: 400 });
  await saveProgress(id, parsed.data);

  const key = attempt.quizId
    ? await db.select({ id: questions.id, position: questions.position, answer: questions.answerIndex })
        .from(questions).where(eq(questions.quizId, attempt.quizId)).orderBy(asc(questions.position))
    : [];
  const rows = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, id));
  let score = 0;
  for (const r of rows) {
    const q = key.find((k) => k.position === r.position);
    const correct = !!q && r.choice != null && r.choice === q.answer;
    if (correct) score++;
    await db.update(attemptAnswers).set({ correct, questionId: q?.id ?? r.questionId })
      .where(and(eq(attemptAnswers.attemptId, id), eq(attemptAnswers.position, r.position)));
  }
  await db.update(attempts).set({ status: "done", score, finishedAt: new Date(), updatedAt: new Date() })
    .where(eq(attempts.id, id));
  return NextResponse.json({ ok: true, score, total: attempt.total });
}
