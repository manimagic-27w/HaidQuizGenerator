"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Draft } from "@/lib/generate";
import type { Student } from "@/lib/auth";
import { LETTERS } from "@/lib/metrics";
import AssignPicker from "@/components/AssignPicker";

/** Check, edit and publish a quiz draft. Shared by "New quiz" and "Next round". */
export default function DraftReview({ initial, students, defaultAssignees, onDiscard, highlightTopics = [] }: {
  initial: Draft; students: Student[]; defaultAssignees: string[]; onDiscard: () => void; highlightTopics?: string[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [assignedTo, setAssignedTo] = useState<string[]>(defaultAssignees);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const weak = new Set(highlightTopics.map((t) => t.toLowerCase()));

  const editQ = (i: number, patch: Partial<Draft["questions"][number]>) =>
    setDraft((d) => ({ ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));

  async function publish() {
    setPublishing(true); setError("");
    const res = await fetch("/api/quizzes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...draft, assignedTo }) });
    if (res.ok) { router.push("/parent"); router.refresh(); return; }
    const data = await res.json().catch(() => ({}));
    setError(data.error || "Couldn't publish the quiz. Try again.");
    setPublishing(false);
  }

  const reviewCount = draft.questions.filter((q) => weak.has(q.topic.toLowerCase())).length;

  return (
    <section className="sheet stack">
      <div className="spread">
        <h2>Check the questions</h2>
        <div className="row">
          {weak.size > 0 && <span className="pill warn">{reviewCount} on missed topics</span>}
          <span className="pill info">{draft.questions.length} questions</span>
        </div>
      </div>
      <p className="small muted">Edit anything that&apos;s off, pick a different correct answer with the circle, or remove a question. Answer order is shuffled when you publish.</p>
      <div className="row">
        <div className="field"><label className="label" htmlFor="title">Title</label>
          <input id="title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
        <div className="field" style={{ maxWidth: 200 }}><label className="label" htmlFor="subject">Subject</label>
          <input id="subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></div>
      </div>
      <div>
        {draft.questions.map((q, i) => (
          <div className="dq" key={i}>
            <div className="spread">
              <div className="row">
                <span className="qnum">Q{i + 1}</span>
                {q.topic && <span className={`pill ${weak.has(q.topic.toLowerCase()) ? "warn" : "info"}`}>{q.topic}</span>}
              </div>
              <button className="btn ghost sm" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })}>Remove</button>
            </div>
            <div className="field"><textarea id={`q${i}`} rows={2} value={q.prompt} aria-label={`Question ${i + 1}`} onChange={(e) => editQ(i, { prompt: e.target.value })} /></div>
            {q.choices.map((c, j) => (
              <label className={`opt ${j === q.answerIndex ? "correct" : ""}`} key={j}>
                <input type="radio" name={`ans${i}`} checked={j === q.answerIndex} onChange={() => editQ(i, { answerIndex: j })} aria-label={`Mark ${LETTERS[j]} correct`} />
                <span className="mono small">{LETTERS[j]}</span>
                <input type="text" value={c} onChange={(e) => editQ(i, { choices: q.choices.map((x, k) => (k === j ? e.target.value : x)) })} />
              </label>
            ))}
            {q.explanation && <p className="small muted">{q.explanation}</p>}
          </div>
        ))}
      </div>
      {draft.studyNotes && (
        <details className="notes">
          <summary>Study guide notes saved with this quiz</summary>
          <p className="small muted">Later rounds are written from these notes, so you won&apos;t need the pages again. Fix anything that was misread.</p>
          <textarea id="notes" rows={12} value={draft.studyNotes} onChange={(e) => setDraft({ ...draft, studyNotes: e.target.value })} />
        </details>
      )}
      <AssignPicker students={students} value={assignedTo} onChange={setAssignedTo} idPrefix="draft" />
      {error && <p className="err small">{error}</p>}
      <div className="row">
        <button className="btn primary" disabled={publishing || !draft.questions.length} onClick={publish}>{publishing ? "Publishing…" : "Publish quiz"}</button>
        <button className="btn" onClick={onDiscard} disabled={publishing}>Start over</button>
      </div>
    </section>
  );
}
