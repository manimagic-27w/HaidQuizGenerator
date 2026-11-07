import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, quizzes, questions, attempts, attemptAnswers } from "@/db";
import { canSee, requireViewer } from "@/lib/auth";
import QuizPlayer, { type PlayerAnswer } from "./QuizPlayer";

export const dynamic = "force-dynamic";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id));
  if (!quiz || quiz.ownerFamilyId !== viewer.familyId || (!viewer.isParent && (quiz.archived || !canSee(quiz.assignedTo, viewer.id)))) notFound();
  const qs = await db.select().from(questions).where(eq(questions.quizId, id)).orderBy(asc(questions.position));
  if (!qs.length) notFound();

  const blank = (): PlayerAnswer[] => qs.map(() => ({ choice: null, firstChoice: null, changes: 0, ms: 0, visits: 0 }));

  // Parents get a preview that grades in the browser and saves nothing.
  if (viewer.isParent) {
    return <QuizPlayer quiz={{ title: quiz.title, subject: quiz.subject }} questions={qs.map((q) => ({ prompt: q.prompt, choices: q.choices }))}
      preview={{ key: qs.map((q) => ({ answer: q.answerIndex, explanation: q.explanation })) }}
      attempt={{ id: null, answers: blank(), awayMs: 0, awayCount: 0, idleMs: 0 }} />;
  }

  // Students resume their open attempt, or start a new one.
  let [attempt] = await db.select().from(attempts)
    .where(and(eq(attempts.quizId, id), eq(attempts.studentId, viewer.id), eq(attempts.status, "in_progress")));
  let answers = blank();
  if (attempt) {
    await db.update(attempts).set({ sessions: attempt.sessions + 1 }).where(eq(attempts.id, attempt.id));
    const rows = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt.id));
    for (const r of rows) if (answers[r.position]) answers[r.position] = { choice: r.choice, firstChoice: r.firstChoice, changes: r.changes, ms: r.ms, visits: r.visits };
  } else {
    [attempt] = await db.insert(attempts).values({
      ownerFamilyId: viewer.familyId, quizId: id, quizTitle: quiz.title, studentId: viewer.id, studentName: viewer.name, total: qs.length,
    }).returning();
    await db.insert(attemptAnswers).values(qs.map((q, i) => ({ attemptId: attempt.id, position: i, questionId: q.id })));
    answers = blank();
  }

  return <QuizPlayer quiz={{ title: quiz.title, subject: quiz.subject }} questions={qs.map((q) => ({ prompt: q.prompt, choices: q.choices }))}
    attempt={{ id: attempt.id, answers, awayMs: attempt.awayMs, awayCount: attempt.awayCount, idleMs: attempt.idleMs }} />;
}
