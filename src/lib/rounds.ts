import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db, quizzes, questions, attempts, attemptAnswers, type Quiz } from "@/db";
import type { Miss } from "@/lib/generate";
import { LETTERS } from "@/lib/metrics";

/** Every quiz made from the same study guide: the first one plus every later round. Only within the owner's family. */
export async function loadFamily(quizId: string, ownerFamilyId: string) {
  const [quiz] = await db.select().from(quizzes).where(and(eq(quizzes.id, quizId), eq(quizzes.ownerFamilyId, ownerFamilyId)));
  if (!quiz) return null;
  const familyKey = quiz.familyId ?? quiz.id;
  const members = await db.select().from(quizzes)
    .where(and(eq(quizzes.ownerFamilyId, ownerFamilyId), or(eq(quizzes.id, familyKey), eq(quizzes.familyId, familyKey))))
    .orderBy(asc(quizzes.createdAt));
  const ids = members.map((m) => m.id);
  const qs = ids.length ? await db.select().from(questions).where(inArray(questions.quizId, ids)) : [];
  return { quiz, familyKey, members, questions: qs };
}

/** The saved outline, newest first. Older quizzes made before notes existed fall back to their own questions. */
export function familyNotes(f: NonNullable<Awaited<ReturnType<typeof loadFamily>>>) {
  const withNotes = [...f.members].reverse().find((m) => m.studyNotes.trim());
  if (withNotes) return { notes: withNotes.studyNotes, fromQuestions: false };
  const lines = f.questions
    .sort((a, b) => a.position - b.position)
    .map((q) => `- ${q.prompt} Answer: ${q.choices[q.answerIndex]}.${q.explanation ? ` ${q.explanation}` : ""}`);
  return { notes: lines.join("\n"), fromQuestions: true };
}

/** Round number for the next quiz in the family, and a title for it. */
export function nextRound(f: { quiz: Quiz; members: Quiz[] }) {
  const base = f.members[0]?.title.replace(/\s*·\s*Round \d+$/i, "") || f.quiz.title;
  const n = f.members.length + 1;
  return { round: n, title: `${base} · Round ${n}`.slice(0, 120) };
}

/** Questions this student got wrong or skipped on any finished round from this guide, most-missed first. */
export async function familyMisses(familyIds: string[], studentId: string | null): Promise<Miss[]> {
  if (!familyIds.length) return [];
  const where = studentId
    ? and(inArray(attempts.quizId, familyIds), eq(attempts.status, "done"), eq(attempts.studentId, studentId))
    : and(inArray(attempts.quizId, familyIds), eq(attempts.status, "done"));
  const rows = await db
    .select({ correct: attemptAnswers.correct, choice: attemptAnswers.choice, q: questions, at: attempts.finishedAt })
    .from(attemptAnswers)
    .innerJoin(attempts, eq(attempts.id, attemptAnswers.attemptId))
    .innerJoin(questions, eq(questions.id, attemptAnswers.questionId))
    .where(and(where, eq(attemptAnswers.correct, false)))
    .orderBy(desc(attempts.finishedAt));
  const byQuestion = new Map<string, Miss>();
  for (const r of rows) {
    const m = byQuestion.get(r.q.id);
    if (m) { m.times++; continue; }
    byQuestion.set(r.q.id, {
      topic: r.q.topic,
      prompt: r.q.prompt,
      correct: `${LETTERS[r.q.answerIndex]}. ${r.q.choices[r.q.answerIndex]}`,
      picked: r.choice == null ? null : `${LETTERS[r.choice]}. ${r.q.choices[r.choice]}`,
      times: 1,
    });
  }
  return [...byQuestion.values()].sort((a, b) => b.times - a.times).slice(0, 40);
}

/** Missed-question counts by topic, for the parent's preview of what the next round will focus on. */
export function topicCounts(misses: Miss[]) {
  const counts = new Map<string, number>();
  for (const m of misses) counts.set(m.topic || "Other", (counts.get(m.topic || "Other") || 0) + m.times);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count }));
}

/** Students who have finished at least one round from this guide. */
export async function familyTakers(familyIds: string[]) {
  if (!familyIds.length) return [];
  const rows = await db.selectDistinct({ id: attempts.studentId }).from(attempts)
    .where(and(inArray(attempts.quizId, familyIds), eq(attempts.status, "done")));
  return rows.map((r) => r.id);
}
