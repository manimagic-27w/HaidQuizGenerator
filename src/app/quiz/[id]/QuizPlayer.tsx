"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IDLE_MS, LETTERS, fmtClock, fmtDur, fmtSec } from "@/lib/metrics";

export type PlayerAnswer = { choice: number | null; firstChoice: number | null; changes: number; ms: number; visits: number };
type Props = {
  quiz: { title: string; subject: string };
  questions: { prompt: string; choices: string[] }[];
  attempt: { id: string | null; answers: PlayerAnswer[]; awayMs: number; awayCount: number; idleMs: number };
  preview?: { key: { answer: number; explanation: string }[] };
};

export default function QuizPlayer({ quiz, questions, attempt, preview }: Props) {
  const router = useRouter();
  const n = questions.length;
  const firstOpen = attempt.answers.findIndex((a) => a.choice == null);

  // Timing lives in a ref so ticks and listeners don't re-render or go stale.
  const t = useRef({
    answers: attempt.answers.map((a) => ({ ...a })),
    awayMs: attempt.awayMs, awayCount: attempt.awayCount, idleMs: attempt.idleMs,
    cur: firstOpen >= 0 ? firstOpen : 0,
    segStart: 0, lastInput: 0, away: false, awayStart: 0, paused: false,
  });
  const [cur, setCur] = useState(t.current.cur);
  const [reviewing, setReviewing] = useState(false);
  const [, setTick] = useState(0);
  const [saveErr, setSaveErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [previewResult, setPreviewResult] = useState<null | { score: number }>(null);

  /** Credit time since the last flush to the current question; anything past the idle cutoff goes to idle time. */
  const flush = useCallback(() => {
    const s = t.current, now = performance.now();
    if (s.away || s.paused) { s.segStart = now; return; }
    const idleFrom = s.lastInput + IDLE_MS;
    let active = now - s.segStart, idle = 0;
    if (idleFrom < now) { active = Math.max(0, idleFrom - s.segStart); idle = now - Math.max(s.segStart, idleFrom); }
    s.answers[s.cur].ms += active; s.idleMs += idle; s.segStart = now;
  }, []);

  const payload = () => {
    const s = t.current;
    return { answers: s.answers.map((a, position) => ({ position, ...a, ms: Math.round(a.ms) })), awayMs: Math.round(s.awayMs), awayCount: s.awayCount, idleMs: Math.round(s.idleMs) };
  };

  const saving = useRef<Promise<void> | null>(null);
  const save = useCallback(async (opts: { keepalive?: boolean } = {}) => {
    if (!attempt.id) return;
    flush();
    const body = JSON.stringify(payload());
    const run = async () => {
      try {
        const res = await fetch(`/api/attempts/${attempt.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body, keepalive: opts.keepalive });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save");
        setSaveErr("");
      } catch (e) {
        setSaveErr(`Not saved yet: ${(e as Error).message}. Your answers will save on the next question.`);
      }
    };
    saving.current = (saving.current || Promise.resolve()).then(run);
    await saving.current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.id, flush]);

  useEffect(() => {
    const s = t.current, now = performance.now();
    s.segStart = now; s.lastInput = now; s.answers[s.cur].visits++;
    const onInput = () => { flush(); t.current.lastInput = performance.now(); };
    const goAway = () => {
      if (s.away) return;
      flush(); s.away = true; s.awayStart = performance.now(); s.awayCount++;
      save({ keepalive: true });
    };
    const comeBack = () => {
      if (!s.away) return;
      const now2 = performance.now();
      s.awayMs += now2 - s.awayStart; s.away = false; s.segStart = now2; s.lastInput = now2;
      setTick((x) => x + 1);
    };
    const onVis = () => (document.hidden ? goAway() : comeBack());
    const evs = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
    evs.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", goAway);
    window.addEventListener("focus", comeBack);
    window.addEventListener("pagehide", goAway);
    const id = setInterval(() => { flush(); setTick((x) => x + 1); }, 1000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, onInput));
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", goAway);
      window.removeEventListener("focus", comeBack);
      window.removeEventListener("pagehide", goAway);
      clearInterval(id);
    };
  }, [flush, save]);

  const goTo = (i: number) => {
    flush();
    const s = t.current;
    s.cur = Math.max(0, Math.min(n - 1, i)); s.answers[s.cur].visits++; s.paused = false;
    setCur(s.cur); setReviewing(false); setConfirmExit(false);
    save();
  };
  const choose = (i: number) => {
    const a = t.current.answers[t.current.cur];
    if (a.choice === i) return;
    flush();
    if (a.choice == null) a.firstChoice = i; else a.changes++;
    a.choice = i;
    setTick((x) => x + 1);
  };
  const toReview = () => { flush(); t.current.paused = true; setReviewing(true); save(); };

  const submit = async () => {
    flush(); setSubmitting(true);
    if (preview) {
      const score = t.current.answers.filter((a, i) => a.choice === preview.key[i].answer).length;
      setPreviewResult({ score }); setSubmitting(false); window.scrollTo(0, 0);
      return;
    }
    await saving.current;
    const res = await fetch(`/api/attempts/${attempt.id}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload()) });
    if (res.ok || res.status === 409) { router.push(`/results/${attempt.id}`); return; }
    setSaveErr((await res.json().catch(() => ({}))).error || "Couldn't submit. Check your connection and try again.");
    setSubmitting(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (reviewing || previewResult || (e.target as HTMLElement)?.closest?.("input,textarea")) return;
      const k = e.key.toLowerCase();
      const idx = "1234".includes(k) ? "1234".indexOf(k) : "abcd".indexOf(k);
      if (k.length === 1 && idx >= 0 && idx < questions[t.current.cur].choices.length) choose(idx);
      else if (e.key === "ArrowRight" && t.current.cur < n - 1) goTo(t.current.cur + 1);
      else if (e.key === "ArrowLeft" && t.current.cur > 0) goTo(t.current.cur - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const s = t.current;
  const done = s.answers.filter((a) => a.choice != null).length;
  const elapsed = s.answers.reduce((x, a) => x + a.ms, 0) + s.idleMs + s.awayMs;

  if (preview && previewResult) {
    const active = s.answers.reduce((x, a) => x + a.ms, 0);
    return (
      <div className="stack" style={{ gap: 20 }}>
        <section className="sheet stack">
          <div className="label">{quiz.title} · preview, not recorded</div>
          <div className="score"><b className="mono">{Math.round((100 * previewResult.score) / n)}%</b><span>{previewResult.score} of {n} correct</span></div>
          <p className="small muted">Time: <b className="mono">{fmtDur(elapsed)}</b> · about <b className="mono">{fmtSec(done ? active / done : 0)}</b> per question</p>
          <div className="row"><Link className="btn primary" href="/">Back to quizzes</Link></div>
        </section>
        <div className="review">
          {questions.map((q, i) => {
            const a = s.answers[i], ok = a.choice === preview.key[i].answer;
            return (
              <div className={`rv ${ok ? "ok" : "no"}`} key={i}>
                <b>Q{i + 1}. {q.prompt}</b>
                <p><b>Answer:</b> {LETTERS[preview.key[i].answer]}. {q.choices[preview.key[i].answer]}</p>
                {preview.key[i].explanation && <p className="muted">{preview.key[i].explanation}</p>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const item = questions[cur], ans = s.answers[cur];
  const missing = s.answers.map((a, i) => (a.choice == null ? i : -1)).filter((i) => i >= 0);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="qhead">
        <div><div className="label">{quiz.subject || "Quiz"}{preview ? " · preview, not recorded" : ""}</div><h2>{quiz.title}</h2></div>
        <div className="row">
          <span className="clock" aria-label="Time spent">{fmtClock(elapsed)}</span>
          <button className="btn ghost sm" onClick={async () => {
            if (!confirmExit) { setConfirmExit(true); return; }
            await save(); router.push("/"); router.refresh();
          }}>{confirmExit ? "Leave? Tap again" : "Save & exit"}</button>
        </div>
      </div>
      <div className="bar" aria-hidden="true"><i style={{ width: `${(100 * done) / n}%` }} /></div>

      {reviewing ? (
        <section className="sheet stack">
          <h2>Ready to turn it in?</h2>
          <p>You answered <b>{done} of {n}</b> questions.{" "}
            {missing.length ? <>Still blank: {missing.map((i) => <button key={i} className="btn sm" style={{ marginRight: 6 }} onClick={() => goTo(i)}>Q{i + 1}</button>)}</> : "Every question has an answer."}
          </p>
          <p className="muted small">After you submit you&apos;ll see which ones you got right, with an explanation for each.</p>
          <div className="navrow">
            <button className="btn" onClick={() => goTo(missing[0] ?? n - 1)}>Back to questions</button>
            <button className="btn primary" disabled={submitting} onClick={submit}>{submitting ? "Submitting…" : "Submit quiz"}</button>
          </div>
        </section>
      ) : (
        <>
          <section className="stack" aria-live="polite">
            <div><span className="qnum">Q{cur + 1} / {n}</span></div>
            <p className="qtext">{item.prompt}</p>
            <div className="choices">
              {item.choices.map((c, i) => (
                <button key={i} className="choice" aria-pressed={ans.choice === i} onClick={() => choose(i)}>
                  <span className="k">{LETTERS[i]}</span><span>{c}</span>
                </button>
              ))}
            </div>
            <div className="navrow">
              <button className="btn" disabled={cur === 0} onClick={() => goTo(cur - 1)}>Back</button>
              {cur === n - 1
                ? <button className="btn primary" onClick={toReview}>Review &amp; submit</button>
                : <button className="btn primary" onClick={() => goTo(cur + 1)}>{ans.choice == null ? "Skip for now" : "Next"}</button>}
            </div>
          </section>
          <div className="dots" aria-label="Jump to question">
            {s.answers.map((a, i) => (
              <button key={i} className={`dot ${a.choice != null ? "done" : ""} ${i === cur ? "cur" : ""}`} onClick={() => goTo(i)} aria-label={`Question ${i + 1}`}>{i + 1}</button>
            ))}
          </div>
        </>
      )}
      {saveErr && <p className="err small">{saveErr}</p>}
    </div>
  );
}
