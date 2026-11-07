import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, attempts, attemptAnswers, questions } from "@/db";
import { requireViewer } from "@/lib/auth";
import { LETTERS, fmtDur, fmtSec, metrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function Results({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [a] = await db.select().from(attempts).where(eq(attempts.id, id));
  if (!a || a.status !== "done" || (a.ownerFamilyId !== viewer.familyId || (a.studentId !== viewer.id && !viewer.isParent))) notFound();
  const rows = await db.select({ ans: attemptAnswers, q: questions }).from(attemptAnswers)
    .leftJoin(questions, eq(questions.id, attemptAnswers.questionId))
    .where(eq(attemptAnswers.attemptId, id)).orderBy(asc(attemptAnswers.position));
  const m = metrics({ ...a, answers: rows.map((r) => r.ans) });
  const pct = m.pct ?? 0;

  return (
    <>
      <section className="sheet stack">
        <div className="label">{a.quizTitle}</div>
        <div className="score"><b className="mono">{pct}%</b><span>{a.score} of {a.total} correct</span></div>
        <p className="small muted">Time: <b className="mono">{fmtDur(m.total)}</b> · about <b className="mono">{fmtSec(m.per)}</b> per question</p>
        <p>{pct >= 90 ? "Excellent work. You know this material."
          : pct >= 75 ? "Solid. Look over the ones you missed below."
          : pct >= 60 ? "Getting there. Reread the explanations, then try it again tomorrow."
          : "This one needs another pass through the study guide before a retake."}</p>
        <div className="row">
          <Link className="btn primary" href="/">Back to quizzes</Link>
          {viewer.isParent && <Link className="btn" href={`/parent/attempts/${a.id}`}>Time breakdown</Link>}
        </div>
      </section>
      <section className="stack">
        <h2>Review</h2>
        <div className="review">
          {rows.map(({ ans, q }) => (
            <div className={`rv ${ans.correct ? "ok" : "no"}`} key={ans.position}>
              <div className="spread">
                <b>Q{ans.position + 1}. {q?.prompt ?? "(question removed)"}</b>
                <span className={`pill ${ans.correct ? "good" : "bad"}`}>{ans.correct ? "Correct" : ans.choice == null ? "Skipped" : "Missed"}</span>
              </div>
              {q && !ans.correct && ans.choice != null && <p>Your answer: {LETTERS[ans.choice]}. {q.choices[ans.choice]}</p>}
              {q && <p><b>Answer:</b> {LETTERS[q.answerIndex]}. {q.choices[q.answerIndex]}</p>}
              {q?.explanation && <p className="muted">{q.explanation}</p>}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
