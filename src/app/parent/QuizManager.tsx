"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Student } from "@/lib/auth";
import AssignPicker, { assigneeLabel } from "@/components/AssignPicker";

type Q = { id: string; title: string; archived: boolean; assignedTo: string[]; count: number; finished: number };

export default function QuizManager({ quizzes, students }: { quizzes: Q[]; students: Student[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; ids: string[] } | null>(null);
  const [error, setError] = useState("");
  if (!quizzes.length) return null;

  async function call(id: string, init: RequestInit) {
    setBusy(id); setError("");
    const res = await fetch(`/api/quizzes/${id}`, { headers: { "content-type": "application/json" }, ...init });
    if (!res.ok) setError("That didn't work. Try again.");
    setBusy(null); setConfirm(null); setEditing(null); router.refresh();
  }

  return (
    <section className="stack">
      <h2>Quizzes</h2>
      <div className="sheet" style={{ paddingBlock: 4 }}>
        {quizzes.map((q) => (
          <div className="mq" key={q.id}>
            <div style={{ minWidth: 0, flex: "1 1 260px" }}>
              <b>{q.title}</b> {q.archived && <span className="pill warn">Hidden</span>}
              <div className="small muted">{q.count} questions · {q.finished} finished {q.finished === 1 ? "attempt" : "attempts"}</div>
              <div className="who">For: <b>{assigneeLabel(q.assignedTo, students)}</b></div>
            </div>
            <div className="row">
              <Link className="btn sm primary" href={`/parent/quizzes/${q.id}/round`} prefetch={false}>Next round</Link>
              <Link className="btn sm" href={`/quiz/${q.id}`} prefetch={false}>Preview</Link>
              <button className="btn sm" disabled={busy === q.id}
                onClick={() => setEditing(editing?.id === q.id ? null : { id: q.id, ids: q.assignedTo })}>
                {editing?.id === q.id ? "Cancel" : "Assign"}
              </button>
              <button className="btn sm" disabled={busy === q.id} onClick={() => call(q.id, { method: "PATCH", body: JSON.stringify({ archived: !q.archived }) })}>
                {q.archived ? "Unhide" : "Hide"}
              </button>
              <button className="btn sm danger" disabled={busy === q.id}
                onClick={() => (confirm === q.id ? call(q.id, { method: "DELETE" }) : setConfirm(q.id))}>
                {confirm === q.id ? "Confirm delete" : "Delete"}
              </button>
            </div>
            {editing?.id === q.id && (
              <div className="stack" style={{ flexBasis: "100%" }}>
                <AssignPicker students={students} value={editing.ids} idPrefix={`q-${q.id}`}
                  onChange={(ids) => setEditing({ id: q.id, ids })} />
                <div className="row">
                  <button className="btn primary sm" disabled={busy === q.id}
                    onClick={() => call(q.id, { method: "PATCH", body: JSON.stringify({ assignedTo: editing.ids }) })}>
                    Save assignment
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <p className="err small">{error}</p>}
      <p className="small muted"><b>Next round</b> writes 20 new questions from the saved study guide notes, aimed at what was missed. Deleting a quiz keeps past scores and times in the table above. A student keeps their results even if you unassign them.</p>
    </section>
  );
}
