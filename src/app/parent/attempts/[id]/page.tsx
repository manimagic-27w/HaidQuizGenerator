import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, attempts, attemptAnswers, questions } from "@/db";
import { requireParent } from "@/lib/auth";
import { RUSH_MS, fmtDur, fmtSec, fmtWhen, metrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function AttemptDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireParent();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [a] = await db.select().from(attempts).where(eq(attempts.id, id));
  if (!a) notFound();
  const rows = await db.select({ ans: attemptAnswers, q: questions }).from(attemptAnswers)
    .leftJoin(questions, eq(questions.id, attemptAnswers.questionId))
    .where(eq(attemptAnswers.attemptId, id)).orderBy(asc(attemptAnswers.position));
  const ans = rows.map((r) => r.ans);
  const m = metrics({ ...a, answers: ans });

  // per-question time chart, drawn to one scale
  const maxS = Math.max(10, ...ans.map((x) => x.ms / 1000));
  const step = maxS > 120 ? 30 : maxS > 60 ? 15 : maxS > 30 ? 10 : 5;
  const top = Math.ceil(maxS / step) * step;
  const W = 660, H = 230, L = 42, R = 10, T = 14, B = 30, cw = W - L - R, ch = H - T - B;
  const bw = cw / Math.max(1, ans.length);
  const y = (s: number) => T + ch - (s / top) * ch;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const color = (x: (typeof ans)[number]) =>
    x.choice == null ? "var(--muted)" : x.correct === true ? "var(--good)" : x.correct === false ? "var(--bad)" : "var(--accent)";

  const notes: string[] = [];
  if (m.rushedWrong) notes.push(`${m.rushedWrong} wrong ${m.rushedWrong > 1 ? "answers were" : "answer was"} given in under ${RUSH_MS / 1000} seconds, which usually means guessing.`);
  if (m.awayCount) notes.push(`Left the quiz ${m.awayCount} ${m.awayCount > 1 ? "times" : "time"} for ${fmtDur(m.away)} in total.`);
  if (m.idle > 0) notes.push(`${fmtDur(m.idle)} with no taps or keys for over a minute.`);
  if (m.changes) notes.push(`Changed answers ${m.changes} ${m.changes > 1 ? "times" : "time"}.`);
  if (a.sessions > 1) notes.push(`Taken across ${a.sessions} sittings.`);
  const missedTopics = [...new Set(rows.filter((r) => r.ans.correct === false && r.q?.topic).map((r) => r.q!.topic))];
  if (missedTopics.length) notes.push(`Missed topics: ${missedTopics.join(", ")}.`);
  const slow = rows.map((r) => r).sort((p, q) => q.ans.ms - p.ans.ms).slice(0, 3);

  return (
    <>
      <section className="stack">
        <Link href="/parent" className="small">← Parent dashboard</Link>
        <div className="spread"><h1>{a.quizTitle}</h1><span className={`pill ${m.effort.tone}`}>{m.effort.label}</span></div>
        <p className="small muted">
          {a.studentName && <>{a.studentName} · </>}Started {fmtWhen(a.startedAt)}{a.finishedAt ? ` · submitted ${fmtWhen(a.finishedAt)}` : " · not submitted yet"}
        </p>
      </section>

      <section className="sheet stack">
        <div className="kv">
          <div><span>Score</span><span>{m.pct != null ? `${a.score}/${a.total} (${m.pct}%)` : "—"}</span></div>
          <div><span>Total time</span><span>{fmtDur(m.total)}</span></div>
          <div><span>Focused time</span><span>{fmtDur(m.active)}</span></div>
          <div><span>Avg per question</span><span>{fmtSec(m.per)}</span></div>
          <div><span>Median per question</span><span>{fmtSec(m.median)}</span></div>
          <div><span>Rushed (&lt;{RUSH_MS / 1000}s)</span><span>{m.rushed} of {m.answered}</span></div>
          <div><span>Time away</span><span>{fmtDur(m.away)}</span></div>
          <div><span>Idle time</span><span>{fmtDur(m.idle)}</span></div>
        </div>
        <h3>Time on each question</h3>
        <div className="legend">
          <span><i style={{ background: "var(--good)" }} />Correct</span>
          <span><i style={{ background: "var(--bad)" }} />Wrong</span>
          <span><i style={{ background: "var(--muted)" }} />Skipped</span>
          {a.status !== "done" && <span><i style={{ background: "var(--accent)" }} />Not graded yet</span>}
        </div>
        <div className="chart">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Seconds spent on each question">
            {ticks.map((tk) => (
              <g key={tk}>
                <line x1={L} x2={W - R} y1={y(tk)} y2={y(tk)} stroke="var(--rule)" strokeWidth={1} />
                <text x={L - 6} y={y(tk) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{tk}s</text>
              </g>
            ))}
            {ans.map((x, i) => {
              const s = x.ms / 1000, bx = L + i * bw + bw * 0.15, w = bw * 0.7;
              return (
                <g key={i}>
                  <rect x={bx} y={y(s)} width={w} height={Math.max(0, T + ch - y(s))} rx={2} fill={color(x)}>
                    <title>{`Q${i + 1}: ${s.toFixed(1)}s${x.changes ? `, changed answer ${x.changes}×` : ""}`}</title>
                  </rect>
                  <text x={bx + w / 2} y={H - B + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">{i + 1}</text>
                </g>
              );
            })}
            <line x1={L} x2={W - R} y1={y(RUSH_MS / 1000)} y2={y(RUSH_MS / 1000)} stroke="var(--warn)" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={W - R} y={y(RUSH_MS / 1000) - 5} textAnchor="end" fontSize={11} fill="var(--warn)">rushed below {RUSH_MS / 1000}s</text>
          </svg>
        </div>
        {notes.length > 0 && <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      </section>

      <section className="stack">
        <h2>Longest questions</h2>
        <div className="sheet stack">
          {slow.map(({ ans: x, q }) => (
            <p key={x.position} className="small">
              <span className="mono">{fmtSec(x.ms)}</span> · Q{x.position + 1}. {q?.prompt ?? "(question removed)"}{" "}
              {x.correct === true && <span className="pill good">Correct</span>}
              {x.correct === false && <span className="pill bad">Wrong</span>}
            </p>
          ))}
        </div>
        <div className="row">
          {a.status === "done" && <Link className="btn" href={`/results/${a.id}`}>See every answer</Link>}
          {a.quizId && <Link className="btn primary" href={`/parent/quizzes/${a.quizId}/round`}>Make the next round</Link>}
        </div>
      </section>
    </>
  );
}
