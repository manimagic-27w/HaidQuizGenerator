"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Q = { id: string; title: string; archived: boolean; count: number; finished: number };

export default function QuizManager({ quizzes }: { quizzes: Q[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!quizzes.length) return null;

  async function call(id: string, init: RequestInit) {
    setBusy(id); setError("");
    const res = await fetch(`/api/quizzes/${id}`, { headers: { "content-type": "application/json" }, ...init });
    if (!res.ok) setError("That didn't work. Try again.");
    setBusy(null); setConfirm(null); router.refresh();
  }

  return (
    <section className="stack">
      <h2>Quizzes</h2>
      <div className="sheet" style={{ paddingBlock: 4 }}>
        {quizzes.map((q) => (
          <div className="mq" key={q.id}>
            <div style={{ minWidth: 0 }}>
              <b>{q.title}</b> {q.archived && <span className="pill warn">Hidden</span>}
              <div className="small muted">{q.count} questions · {q.finished} finished {q.finished === 1 ? "attempt" : "attempts"}</div>
            </div>
            <div className="row">
              <Link className="btn sm" href={`/quiz/${q.id}`} prefetch={false}>Preview</Link>
              <button className="btn sm" disabled={busy === q.id} onClick={() => call(q.id, { method: "PATCH", body: JSON.stringify({ archived: !q.archived }) })}>
                {q.archived ? "Show to student" : "Hide"}
              </button>
              <button className="btn sm danger" disabled={busy === q.id}
                onClick={() => (confirm === q.id ? call(q.id, { method: "DELETE" }) : setConfirm(q.id))}>
                {confirm === q.id ? "Confirm delete" : "Delete"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="err small">{error}</p>}
      <p className="small muted">Deleting a quiz keeps past scores and times in the table above.</p>
    </section>
  );
}
