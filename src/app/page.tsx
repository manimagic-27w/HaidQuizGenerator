import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, quizzes, questions, attempts, spellingLists, spellingWords } from "@/db";
import { canSee, requireViewer } from "@/lib/auth";
import { GAMES, type Game } from "@/lib/spelling";
import { summarize, wordProgress } from "@/lib/spellingProgress";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await requireViewer();
  const all = await db
    .select({ id: quizzes.id, title: quizzes.title, subject: quizzes.subject, createdAt: quizzes.createdAt, assignedTo: quizzes.assignedTo, count: sql<number>`count(${questions.id})::int` })
    .from(quizzes).leftJoin(questions, eq(questions.quizId, quizzes.id))
    .where(and(eq(quizzes.ownerFamilyId, viewer.familyId), eq(quizzes.archived, false))).groupBy(quizzes.id).orderBy(desc(quizzes.createdAt));
  const list = viewer.isParent ? all : all.filter((q) => canSee(q.assignedTo, viewer.id));
  const allSpelling = await db
    .select({ id: spellingLists.id, title: spellingLists.title, assignedTo: spellingLists.assignedTo, createdAt: spellingLists.createdAt, count: sql<number>`count(${spellingWords.id})::int` })
    .from(spellingLists).leftJoin(spellingWords, eq(spellingWords.listId, spellingLists.id))
    .where(and(eq(spellingLists.ownerFamilyId, viewer.familyId), eq(spellingLists.archived, false))).groupBy(spellingLists.id).orderBy(desc(spellingLists.createdAt));
  const spelling = viewer.isParent ? allSpelling : allSpelling.filter((l) => canSee(l.assignedTo, viewer.id));
  const spellProg = viewer.isParent ? new Map() : await wordProgress(spelling.map((l) => l.id), viewer.id);
  const mine = viewer.isParent ? [] : await db.select({
    quizId: attempts.quizId, status: attempts.status, score: attempts.score, total: attempts.total,
  }).from(attempts).where(and(eq(attempts.studentId, viewer.id)));

  return (
    <>
      <section className="stack">
        <h1>{viewer.isParent ? "Quizzes" : `Ready to study${viewer.name ? `, ${viewer.name}` : ""}?`}</h1>
        <p className="muted">
          {viewer.isParent
            ? "Every active quiz. Each student only sees the ones assigned to them. Opening a quiz from your account is a preview and isn’t recorded."
            : spelling.length && !list.length ? "Pick a spelling game. Turn your sound on!" : "Pick a quiz or a spelling game. Take your time."}
        </p>
      </section>
      {!list.length && (spelling.length && !viewer.isParent) ? null : !list.length ? (
        <div className="notice">
          <h3>No quizzes yet</h3>
          <p className="small" style={{ marginTop: 6 }}>
            {viewer.isParent ? <>Make the first one from a study guide: <Link href="/parent/new">New quiz</Link>.</> : "When a new quiz is added it shows up here."}
          </p>
        </div>
      ) : (
        <div className="qlist">
          {list.map((q) => {
            const tries = mine.filter((a) => a.quizId === q.id);
            const done = tries.filter((a) => a.status === "done");
            const open = tries.some((a) => a.status !== "done");
            const best = done.length ? Math.max(...done.map((a) => Math.round((100 * (a.score || 0)) / (a.total || 1)))) : null;
            return (
              <article className="sheet qcard" key={q.id}>
                {q.subject && <div><span className="pill info">{q.subject}</span></div>}
                <h3>{q.title}</h3>
                <p className="small muted">{q.count} questions · added {q.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                <div className="foot">
                  <span className="small muted">
                    {viewer.isParent ? "" : best != null ? <>Best: <b className="mono">{best}%</b> · {done.length} {done.length === 1 ? "try" : "tries"}</> : "Not taken yet"}
                  </span>
                  <Link prefetch={false} href={`/quiz/${q.id}`} className={`btn sm ${open ? "" : "primary"}`}>
                    {viewer.isParent ? "Preview" : open ? "Resume" : done.length ? "Retake" : "Start"}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {spelling.length > 0 && (
        <section className="stack">
          <h2>Spelling</h2>
          <div className="qlist">
            {spelling.map((l) => {
              const sum = summarize(spellProg.get(l.id) || []);
              return (
                <article className="sheet qcard" key={l.id}>
                  <div><span className="pill hi">Spelling</span></div>
                  <h3>{l.title}</h3>
                  <p className="small muted">{l.count} words{!viewer.isParent && sum.total ? <> · <b className="mono">{sum.mastered}</b> mastered</> : null}</p>
                  {!viewer.isParent && sum.total > 0 && (
                    <div className="mbar" aria-hidden="true">
                      <i className="m" style={{ width: `${(100 * sum.mastered) / sum.total}%` }} />
                      <i className="l" style={{ width: `${(100 * sum.learning) / sum.total}%` }} />
                    </div>
                  )}
                  <div className="foot">
                    {(Object.keys(GAMES) as Game[]).map((g, i) => (
                      <Link key={g} prefetch={false} href={`/spelling/${l.id}/${g}`} className={`btn sm ${i === 0 ? "primary" : ""}`}>{GAMES[g].name}</Link>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
