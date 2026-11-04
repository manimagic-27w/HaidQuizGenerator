"use client";

import { useEffect, useRef, useState } from "react";
import type { Draft, Miss } from "@/lib/generate";
import type { Student } from "@/lib/auth";
import DraftReview from "@/components/DraftReview";

export type FocusOption = { id: string | null; name: string; misses: Miss[]; topics: { topic: string; count: number }[] };

export default function NextRound({ quizId, title, notes, notesFromQuestions, options, defaultFocus, students, assignedTo }: {
  quizId: string; title: string; notes: string; notesFromQuestions: boolean;
  options: FocusOption[]; defaultFocus: string | null; students: Student[]; assignedTo: string[];
}) {
  const [focusId, setFocusId] = useState<string | null>(defaultFocus);
  const [share, setShare] = useState(50);
  const [note, setNote] = useState("");
  const [editedNotes, setEditedNotes] = useState(notes);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - t0), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const focus = options.find((o) => o.id === focusId) ?? null;
  const missCount = focus?.misses.length ?? 0;

  async function generate() {
    setBusy(true); setError(""); setElapsed(0);
    ctl.current = new AbortController();
    try {
      const res = await fetch(`/api/quizzes/${quizId}/round`, {
        method: "POST", headers: { "content-type": "application/json" }, signal: ctl.current.signal,
        body: JSON.stringify({
          studentId: focusId, focus: note, reviewShare: share / 100,
          notes: editedNotes !== notes ? editedNotes : undefined,
        }),
      });
      const data = await res.json().catch(() => ({ error: "The server didn't answer. Try again." }));
      if (!res.ok) throw new Error(data.error);
      setDraft({ ...data.draft, title });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message || "Something went wrong. Try again.");
    } finally {
      setBusy(false); ctl.current = null;
    }
  }

  if (draft) {
    return <DraftReview initial={draft} students={students} onDiscard={() => setDraft(null)}
      highlightTopics={focus?.topics.map((t) => t.topic) ?? []}
      defaultAssignees={focusId ? [focusId] : assignedTo} />;
  }

  return (
    <>
      <section className="sheet stack">
        <h2>What to focus on</h2>
        {!options.length ? (
          <p className="muted">Nobody has finished a quiz from this guide yet, so this round will cover the whole guide with new questions, a little harder than the first.</p>
        ) : (
          <>
            {options.length > 1 && (
              <div className="field" style={{ maxWidth: 320 }}>
                <label className="label" htmlFor="who">Student</label>
                <select id="who" value={focusId ?? ""} onChange={(e) => setFocusId(e.target.value || null)}
                  style={{ border: "1px solid var(--rule)", background: "var(--paper)", borderRadius: 8, padding: "9px 11px" }}>
                  {options.map((o) => <option key={o.id ?? "all"} value={o.id ?? ""}>{o.name}</option>)}
                </select>
              </div>
            )}
            {missCount === 0 ? (
              <p className="muted">{focus?.name || "The student"} hasn&apos;t missed anything yet. This round will cover the whole guide with new questions, a little harder.</p>
            ) : (
              <>
                <p><b>{missCount}</b> missed or skipped {missCount === 1 ? "question" : "questions"} across earlier rounds. Missed most:</p>
                <div className="topics">
                  {focus!.topics.slice(0, 10).map((t) => <span className="pill warn" key={t.topic}>{t.topic} · {t.count}</span>)}
                </div>
                <details className="notes">
                  <summary>See the missed questions</summary>
                  {focus!.misses.map((m, i) => (
                    <div className="miss" key={i}>
                      <b>{m.prompt}</b>
                      <span className="muted">Answer: {m.correct}{m.picked ? ` · Picked ${m.picked}` : " · Skipped"}{m.times > 1 ? ` · missed ${m.times}×` : ""}</span>
                    </div>
                  ))}
                </details>
                <div className="stack" style={{ gap: 4 }}>
                  <label className="label" htmlFor="share">Review questions on missed topics</label>
                  <div className="range">
                    <input id="share" type="range" min={20} max={80} step={10} value={share} onChange={(e) => setShare(+e.target.value)} />
                    <span className="mono">about {Math.round((20 * share) / 100)} of 20</span>
                  </div>
                </div>
              </>
            )}
          </>
        )}
        <div className="field">
          <label className="label" htmlFor="note">Anything else? (optional)</label>
          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. her test is Friday and covers sections 3 and 4 only" />
        </div>
        <details className="notes">
          <summary>Study guide notes</summary>
          {notesFromQuestions ? (
            <p className="small err">This quiz was made before notes were saved, so this round will be written from the earlier questions only. For a wider range, make a new quiz from the study guide pages once; later rounds will then have full notes.</p>
          ) : (
            <p className="small muted">Saved when the first quiz was made. Edit them to add or fix material; your changes are saved with this round.</p>
          )}
          <textarea id="round-notes" rows={14} value={editedNotes} onChange={(e) => setEditedNotes(e.target.value)} />
        </details>
        <div className="row">
          <button className="btn primary" disabled={busy || !editedNotes.trim()} onClick={generate}>{busy ? "Writing questions…" : "Write 20 new questions"}</button>
          {busy && <button className="btn" onClick={() => ctl.current?.abort()}>Stop</button>}
        </div>
        {busy && <p className="small muted">Writing the next round. This usually takes about a minute. <span className="mono">{Math.floor(elapsed / 1000)}s</span></p>}
        {error && <p className="err small">{error}</p>}
      </section>
    </>
  );
}
