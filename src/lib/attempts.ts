import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, attempts, attemptAnswers, type Attempt } from "@/db";

export const progressSchema = z.object({
  answers: z.array(z.object({
    position: z.number().int().min(0).max(99),
    choice: z.number().int().min(0).max(3).nullable(),
    firstChoice: z.number().int().min(0).max(3).nullable(),
    changes: z.number().int().min(0).max(1000),
    ms: z.number().min(0).max(86_400_000),
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
    changes: a.changes, ms: Math.round(a.ms), visits: a.visits,
  }))).onConflictDoUpdate({
    target: [attemptAnswers.attemptId, attemptAnswers.position],
    set: {
      choice: sql`excluded.choice`, firstChoice: sql`excluded.first_choice`, changes: sql`excluded.changes`,
      ms: sql`excluded.ms`, visits: sql`excluded.visits`,
    },
  });
}
