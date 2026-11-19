import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, attempts, attemptAnswers, questions, type Attempt } from "@/db";

export const progressSchema = z.object({
  answers: z.array(z.object({
    position: z.number().int().min(0).max(99),
    choice: z.number().int().min(0).max(3).nullable(),
    firstChoice: z.number().int().min(0).max(3).nullable(),
    changes: z.number().int().min(0).max(1000),
    ms: z.number().min(0).max(86_400_000),
    reviewMs: z.number().min(0).max(86_400_000).default(0),
    visits: z.number().int().min(0).max(10_000),
  })).max(100),
  awayMs: z.number().min(0).max(86_400_000),
  awayCount: z.number().int().min(0).max(10_000),
  idleMs: z.number().min(0).max(86_400_000),
});
export type Progress = z.infer<typeof progressSchema>;

/** The student's own attempt that is still open, or null. */
export async function ownOpenAttempt(id: string, studentId: string, familyId: string): Promise<Attempt | null> {
  const [a] = await db.select().from(attempts)
    .where(and(eq(attempts.id, id), eq(attempts.studentId, studentId), eq(attempts.ownerFamilyId, familyId), eq(attempts.status, "in_progress")));
  return a ?? null;
}

export async function saveProgress(attemptId: string, p: Progress) {
  await db.update(attempts).set({
    awayMs: Math.round(p.awayMs), awayCount: p.awayCount, idleMs: Math.round(p.idleMs), updatedAt: new Date(),
  }).where(eq(attempts.id, attemptId));
  if (!p.answers.length) return;
  await db.insert(attemptAnswers).values(p.answers.map((a) => ({
    attemptId, position: a.position, choice: a.choice, firstChoice: a.firstChoice,
    changes: a.changes, ms: Math.round(a.ms), reviewMs: Math.round(a.reviewMs), visits: a.visits,
  }))).onConflictDoUpdate({
    target: [attemptAnswers.attemptId, attemptAnswers.position],
    set: {
      // Once an answer has been checked it's locked: later saves can't change it.
      choice: sql`case when ${attemptAnswers.correct} is null then excluded.choice else ${attemptAnswers.choice} end`,
      firstChoice: sql`case when ${attemptAnswers.correct} is null then excluded.first_choice else ${attemptAnswers.firstChoice} end`,
      changes: sql`case when ${attemptAnswers.correct} is null then excluded.changes else ${attemptAnswers.changes} end`,
      ms: sql`excluded.ms`, reviewMs: sql`excluded.review_ms`, visits: sql`excluded.visits`,
    },
  });
}

export type Feedback = { correct: boolean; answer: number; explanation: string };

/**
 * Check one answer and lock it. Returns the right answer and explanation so the student learns right away.
 * Checking again returns the first result: the locked answer never changes.
 */
export async function checkAnswer(attempt: Attempt, position: number, choice: number, firstChoice: number | null, changes: number): Promise<Feedback | null> {
  const [row] = await db.select().from(attemptAnswers)
    .where(and(eq(attemptAnswers.attemptId, attempt.id), eq(attemptAnswers.position, position)));
  const [q] = row?.questionId
    ? await db.select().from(questions).where(eq(questions.id, row.questionId))
    : attempt.quizId ? await db.select().from(questions).where(and(eq(questions.quizId, attempt.quizId), eq(questions.position, position))) : [];
  if (!q) return null;
  if (row && row.correct != null) return { correct: row.correct, answer: q.answerIndex, explanation: q.explanation };
  const correct = choice === q.answerIndex;
  await db.insert(attemptAnswers).values({
    attemptId: attempt.id, position, questionId: q.id, choice, firstChoice: firstChoice ?? choice, changes, correct,
  }).onConflictDoUpdate({
    target: [attemptAnswers.attemptId, attemptAnswers.position],
    set: { choice, firstChoice: firstChoice ?? choice, changes, correct, questionId: q.id },
  });
  return { correct, answer: q.answerIndex, explanation: q.explanation };
}
