import { and, eq } from "drizzle-orm";
import { db, attempts, quizzes, questions } from "@/db";
import { canSee, type Viewer } from "@/lib/auth";
import { generateRound, type Draft } from "@/lib/generate";
import { familyMisses, familyNotes, loadFamily } from "@/lib/rounds";
import { recordGeneration } from "@/lib/usage";

export type PracticeStatus =
  | { kind: "available" }
  | { kind: "made"; quizId: string }
  | { kind: "none" }; // not offered for this quiz/viewer

/** Whether a child can make their one practice quiz from this quiz, or already has. */
export async function practiceStatus(quizId: string | null, v: Viewer & { familyId: string }): Promise<PracticeStatus> {
  if (!quizId || v.role !== "child") return { kind: "none" };
  const [q] = await db.select().from(quizzes).where(and(eq(quizzes.id, quizId), eq(quizzes.ownerFamilyId, v.familyId)));
  if (!q || q.madeByStudent || !canSee(q.assignedTo, v.id)) return { kind: "none" };
  const [made] = await db.select({ id: quizzes.id }).from(quizzes)
    .where(and(eq(quizzes.sourceQuizId, quizId), eq(quizzes.createdBy, v.id), eq(quizzes.madeByStudent, true)));
  if (made) return { kind: "made", quizId: made.id };
  const [finished] = await db.select({ id: attempts.id }).from(attempts)
    .where(and(eq(attempts.quizId, quizId), eq(attempts.studentId, v.id), eq(attempts.status, "done"))).limit(1);
  return finished ? { kind: "available" } : { kind: "none" };
}

/** Write and publish the child's practice quiz: 20 new questions aimed at what they missed on this guide. */
export async function makePractice(quizId: string, v: Viewer & { familyId: string }): Promise<string> {
  const f = await loadFamily(quizId, v.familyId);
  if (!f) throw new Error("not_found");
  const { notes } = familyNotes(f);
  const ids = f.members.map((m) => m.id);
  const misses = await familyMisses(ids, v.id);
  const out = await generateRound({
    notes, title: f.members[0].title, subject: f.quiz.subject, misses,
    previous: f.questions.map((q) => q.prompt), focus: "", reviewShare: 0.6,
  });
  await recordGeneration(v.familyId, v.id, "practice");
  const base = f.quiz.title.replace(/\s*·\s*(Round \d+|Practice)$/i, "");
  const [quiz] = await db.insert(quizzes).values({
    ownerFamilyId: v.familyId, title: `${base} · Practice`.slice(0, 120), subject: f.quiz.subject, createdBy: v.id,
    assignedTo: [v.id], studyNotes: notes, familyId: f.familyKey, sourceQuizId: f.quiz.id, madeByStudent: true,
  }).onConflictDoNothing().returning({ id: quizzes.id });
  if (!quiz) {
    // Two taps at once: the other request already saved one.
    const s = await practiceStatus(quizId, v);
    if (s.kind === "made") return s.quizId;
    throw new Error("conflict");
  }
  await insertQuestions(quiz.id, out.questions);
  return quiz.id;
}

/** Save questions with each one's answer choices shuffled, so the right answer isn't always in the same spot. */
export async function insertQuestions(quizId: string, qs: Draft["questions"]) {
  await db.insert(questions).values(qs.map((q, i) => {
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    return {
      quizId, position: i, prompt: q.prompt, choices: order.map((j) => q.choices[j]),
      answerIndex: order.indexOf(q.answerIndex), explanation: q.explanation, topic: q.topic,
    };
  }));
}
