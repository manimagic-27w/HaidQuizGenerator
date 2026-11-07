import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, spellingLists, spellingSessions, spellingResults } from "@/db";
import { listStudents, requireParent } from "@/lib/auth";
import { GAMES } from "@/lib/spelling";
import { summarize, wordProgress } from "@/lib/spellingProgress";
import { fmtDur, fmtWhen } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const STATUS = { mastered: ["Mastered", "good"], learning: ["Practicing", "warn"], new: ["Not tried", "info"] } as const;

export default async function SpellingProgress({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireParent();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [list] = await db.select().from(spellingLists).where(eq(spellingLists.id, id));
  if (!list || list.ownerFamilyId !== viewer.familyId) notFound();

  const sessions = await db.select().from(spellingSessions).where(eq(spellingSessions.listId, id)).orderBy(desc(spellingSessions.startedAt)).limit(100);
  const results = sessions.length ? await db.select().from(spellingResults).where(inArray(spellingResults.sessionId, sessions.map((s) => s.id))) : [];
  const students = await listStudents(viewer.familyId);
  const takerIds = [...new Set(sessions.map((s) => s.studentId))];
  const shown = takerIds.length ? takerIds : list.assignedTo;
  const progress = await Promise.all(shown.map(async (sid) => ({ sid, words: (await wordProgress([id], sid)).get(id) || [] })));
  const nameOf = (sid: string) => students.find((s) => s.id === sid)?.name || sessions.find((s) => s.studentId === sid)?.studentName || "Student";

  return (
    <>
      <section className="stack">
        <Link href="/parent" className="small">← Parent dashboard</Link>
        <h1>{list.title}</h1>
        <div className="row">
          {(Object.keys(GAMES) as (keyof typeof GAMES)[]).map((g) => (
            <Link key={g} className="btn sm" href={`/spelling/${id}/${g}`} prefetch={false}>Try {GAMES[g].name}</Link>
          ))}
        </div>
      </section>

      {!progress.length && <div className="notice">No one has played this list yet. Results show up here after the first game.</div>}

      {progress.map(({ sid, words }) => {
        const s = summarize(words);
        return (
          <section className="stack" key={sid}>
            <div className="spread">
              <h2>{nameOf(sid)}</h2>
              <span className="small muted"><b className="mono">{s.mastered}</b> of {s.total} mastered · {s.learning} practicing · {s.fresh} not tried</span>
            </div>
            <div className="mbar" aria-hidden="true">
              <i className="m" style={{ width: `${(100 * s.mastered) / Math.max(1, s.total)}%` }} />
              <i className="l" style={{ width: `${(100 * s.learning) / Math.max(1, s.total)}%` }} />
            </div>
            <div className="tablebox">
              <table style={{ minWidth: 520 }}>
                <thead><tr><th>Word</th><th>Status</th><th className="n">Right first try</th><th>How it was misspelled</th></tr></thead>
                <tbody>
                  {words.map((w) => (
                    <tr key={w.wordId}>
                      <td><b>{w.word}</b></td>
                      <td><span className={`pill ${STATUS[w.status][1]}`}>{STATUS[w.status][0]}</span></td>
                      <td className="n">{w.tries ? `${w.firstTryCount} of ${w.tries}` : "—"}</td>
                      <td className="mono small" style={{ whiteSpace: "normal" }}>{w.wrong.join(", ") || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">Mastered means right on the first try the last two times she played it. In Word Builder, a misspelling shows the letters so far plus the wrong tile, like &ldquo;nes…&rdquo;.</p>
          </section>
        );
      })}

      {sessions.length > 0 && (
        <section className="stack">
          <h2>Every game</h2>
          <div className="tablebox">
            <table>
              <thead><tr><th>When</th>{takerIds.length > 1 && <th>Student</th>}<th>Game</th><th className="n">First try</th><th className="n">Hints</th><th className="n">Time</th><th className="n">Left page</th><th>Status</th></tr></thead>
              <tbody>
                {sessions.map((s) => {
                  const rs = results.filter((r) => r.sessionId === s.id);
                  const active = rs.reduce((x, r) => x + r.ms, 0);
                  return (
                    <tr key={s.id}>
                      <td>{fmtWhen(s.startedAt)}</td>
                      {takerIds.length > 1 && <td>{nameOf(s.studentId)}</td>}
                      <td>{GAMES[s.game].name}</td>
                      <td className="n">{rs.filter((r) => r.firstTry).length}/{s.total}</td>
                      <td className="n">{rs.reduce((x, r) => x + r.hints, 0)}</td>
                      <td className="n">{fmtDur(active + s.awayMs + s.idleMs)}</td>
                      <td className="n">{s.awayCount}×</td>
                      <td>{s.status === "done" ? <span className="pill good">Finished</span> : <span className="pill info">{rs.length} of {s.total} words</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
