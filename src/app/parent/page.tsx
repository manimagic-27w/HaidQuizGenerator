import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, families, familyMembers, attempts, attemptAnswers, quizzes, questions, spellingLists, spellingWords, spellingSessions } from "@/db";
import { listStudents, requireParent } from "@/lib/auth";
import { IDLE_MS, fmtDur, fmtSec, fmtWhen, metrics } from "@/lib/metrics";
import QuizManager from "./QuizManager";
import FamilyPeople, { type Person } from "./FamilyPeople";
import { clerkClient } from "@clerk/nextjs/server";
import { allowance } from "@/lib/usage";
import SpellingManager from "./SpellingManager";
import { summarize, wordProgress } from "@/lib/spellingProgress";

export const dynamic = "force-dynamic";

export default async function ParentPage() {
  const viewer = await requireParent();
  const fam = viewer.familyId;
  const students = await listStudents(fam);
  const allow = await allowance(fam);
  const [famRow] = await db.select({ name: families.name }).from(families).where(eq(families.id, fam));
  const memberRows = await db.select().from(familyMembers).where(eq(familyMembers.familyId, fam)).orderBy(familyMembers.createdAt);
  const linked = memberRows.map((m) => m.userId).filter((x): x is string => !!x);
  const clerkUsers = linked.length ? (await (await clerkClient()).users.getUserList({ userId: linked, limit: 100 })).data : [];
  const people: Person[] = memberRows
    .map((m) => {
      const u = clerkUsers.find((x) => x.id === m.userId);
      return { id: m.id, email: m.email, role: m.role, signedIn: !!m.userId, isYou: m.userId === viewer.id,
        name: (u && [u.firstName, u.lastName].filter(Boolean).join(" ")) || "" };
    })
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "parent" ? -1 : 1));
  const list = await db.select().from(attempts).where(eq(attempts.ownerFamilyId, fam)).orderBy(desc(attempts.startedAt)).limit(300);
  const ans = list.length ? await db.select().from(attemptAnswers).where(inArray(attemptAnswers.attemptId, list.map((a) => a.id))) : [];
  const rows = list.map((a) => ({ a, m: metrics({ ...a, answers: ans.filter((x) => x.attemptId === a.id) }) }));
  const quizList = await db
    .select({ id: quizzes.id, title: quizzes.title, archived: quizzes.archived, assignedTo: quizzes.assignedTo, count: sql<number>`count(distinct ${questions.id})::int` })
    .from(quizzes).leftJoin(questions, eq(questions.quizId, quizzes.id)).where(eq(quizzes.ownerFamilyId, fam)).groupBy(quizzes.id).orderBy(desc(quizzes.createdAt));
  const finishedByQuiz = Object.fromEntries(quizList.map((q) => [q.id, list.filter((a) => a.quizId === q.id && a.status === "done").length]));

  const cutoff = Date.now() - 30 * 864e5;
  const recent = rows.filter((r) => r.a.status === "done" && r.a.finishedAt && r.a.finishedAt.getTime() >= cutoff).map((r) => r.m);
  const sum = (k: "active" | "answered" | "rushed" | "away" | "idle" | "pct") => recent.reduce((s, x) => s + (x[k] || 0), 0);
  const answered = sum("answered");
  const tiles: [string, string][] = recent.length ? [
    ["Focused study time", fmtDur(sum("active"))],
    ["Quizzes finished", String(recent.length)],
    ["Avg per question", fmtSec(answered ? sum("active") / answered : 0)],
    ["Avg score", `${Math.round(sum("pct") / recent.length)}%`],
    ["Rushed answers", `${Math.round((100 * sum("rushed")) / Math.max(1, answered))}%`],
    ["Away or idle", fmtDur(sum("away") + sum("idle"))],
  ] : [];
  const takers = new Set(list.map((a) => a.studentId));

  // Spelling lists with each player's mastered count
  const sLists = await db
    .select({ id: spellingLists.id, title: spellingLists.title, archived: spellingLists.archived, assignedTo: spellingLists.assignedTo, count: sql<number>`count(${spellingWords.id})::int` })
    .from(spellingLists).leftJoin(spellingWords, eq(spellingWords.listId, spellingLists.id))
    .where(eq(spellingLists.ownerFamilyId, fam))
    .groupBy(spellingLists.id).orderBy(desc(spellingLists.createdAt));
  const players = sLists.length ? await db.selectDistinct({ id: spellingSessions.studentId, name: spellingSessions.studentName })
    .from(spellingSessions).where(inArray(spellingSessions.listId, sLists.map((l) => l.id))) : [];
  const byPlayer = await Promise.all(players.map(async (p) => ({ p, prog: await wordProgress(sLists.map((l) => l.id), p.id) })));
  const spelling = sLists.map((l) => ({
    ...l,
    progress: byPlayer.filter(({ prog }) => (prog.get(l.id) || []).some((w) => w.tries)).map(({ p, prog }) => ({
      name: students.find((s) => s.id === p.id)?.name || p.name || "Student", mastered: summarize(prog.get(l.id) || []).mastered,
    })),
  }));

  return (
    <>
      <section className="spread">
        <div className="stack" style={{ gap: 6 }}>
          <h1>Parent view</h1>
          <p className="muted">How the study time is being spent. New here? Read the <Link href="/guide">parent quick start</Link>.</p>
          {allow.limit != null && (
            <p className="small muted">
              <b className="mono">{allow.left}</b> of {allow.limit} quiz and spelling-list creations left this month · resets on the 1st
            </p>
          )}
        </div>
        <div className="row">
          <Link className="btn primary" href="/parent/new">New quiz from study guide</Link>
          <Link className="btn" href="/parent/spelling/new">New spelling list</Link>
        </div>
      </section>

      <section className="stack">
        <div className="spread"><h2>Last 30 days</h2><span className="small muted">Focused time leaves out time on other apps and idle stretches over {IDLE_MS / 1000}s</span></div>
        {tiles.length ? (
          <div className="tiles">{tiles.map(([k, v]) => <div className="tile" key={k}><span className="label">{k}</span><b>{v}</b></div>)}</div>
        ) : <div className="notice">No finished quizzes yet. Results show up here as soon as one is submitted.</div>}
      </section>

      {rows.length > 0 && (
        <section className="stack">
          <h2>Every attempt</h2>
          <div className="tablebox">
            <table>
              <thead><tr>
                <th>When</th>{takers.size > 1 && <th>Student</th>}<th>Quiz</th><th className="n">Score</th><th className="n">Total</th>
                <th className="n">Focused</th><th className="n">Per Q</th><th className="n">Rushed</th><th className="n">Left page</th><th>Effort</th>
              </tr></thead>
              <tbody>
                {rows.map(({ a, m }) => (
                  <tr key={a.id}>
                    <td><Link href={`/parent/attempts/${a.id}`}>{fmtWhen(a.startedAt)}</Link></td>
                    {takers.size > 1 && <td>{students.find((s) => s.id === a.studentId)?.name || a.studentName || "Student"}</td>}
                    <td>{a.quizTitle}</td>
                    <td className="n">{m.pct != null ? `${a.score}/${a.total}` : `${m.answered}/${a.total}`}</td>
                    <td className="n">{fmtDur(m.total)}</td>
                    <td className="n">{fmtDur(m.active)}</td>
                    <td className="n">{fmtSec(m.per)}</td>
                    <td className="n">{m.rushed}</td>
                    <td className="n">{m.awayCount}×</td>
                    <td><span className={`pill ${m.effort.tone}`}>{m.effort.label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Open a date for the question-by-question breakdown.</p>
        </section>
      )}

      <QuizManager students={students} quizzes={quizList.map((q) => ({ ...q, finished: finishedByQuiz[q.id] || 0 }))} />
      <SpellingManager students={students} lists={spelling} />
      <FamilyPeople familyName={famRow?.name || "Your family"} people={people} />
    </>
  );
}
