"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Student } from "@/lib/auth";
import AssignPicker, { assigneeLabel } from "@/components/AssignPicker";

type L = { id: string; title: string; archived: boolean; assignedTo: string[]; count: number; progress: { name: string; mastered: number }[] };

export default function SpellingManager({ lists, students }: { lists: L[]; students: Student[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; ids: string[] } | null>(null);
  const [error, setError] = useState("");

  async function call(id: string, init: RequestInit) {
    setBusy(id); setError("");
    const res = await fetch(`/api/spelling/${id}`, { headers: { "content-type": "application/json" }, ...init });
    if (!res.ok) setError("That didn't work. Try again.");
    setBusy(null); setConfirm(null); setEditing(null); router.refresh();
  }

  return (
    <section className="stack">
      <div className="spread">
        <h2>Spelling</h2>
        <Link className="btn sm" href="/parent/spelling/new">New spelling list</Link>
      </div>
      {!lists.length ? (
        <div className="notice">No spelling lists yet. Paste a week&apos;s words or snap a photo of the list, and they become two games: Word Builder and Missing Letters.</div>
      ) : (
        <div className="sheet" style={{ paddingBlock: 4 }}>
          {lists.map((l) => (
            <div className="mq" key={l.id}>
              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <b>{l.title}</b> {l.archived && <span className="pill warn">Hidden</span>}
                <div className="small muted">
                  {l.count} words{l.progress.map((p) => <span key={p.name}> · {p.name}: <b className="mono">{p.mastered}/{l.count}</b> mastered</span>)}
                </div>
                <div className="who">For: <b>{assigneeLabel(l.assignedTo, students)}</b></div>
              </div>
              <div className="row">
                <Link className="btn sm primary" href={`/parent/spelling/${l.id}`}>Progress</Link>
                <button className="btn sm" disabled={busy === l.id} onClick={() => setEditing(editing?.id === l.id ? null : { id: l.id, ids: l.assignedTo })}>
                  {editing?.id === l.id ? "Cancel" : "Assign"}
                </button>
                <button className="btn sm" disabled={busy === l.id} onClick={() => call(l.id, { method: "PATCH", body: JSON.stringify({ archived: !l.archived }) })}>
                  {l.archived ? "Unhide" : "Hide"}
                </button>
                <button className="btn sm danger" disabled={busy === l.id} onClick={() => (confirm === l.id ? call(l.id, { method: "DELETE" }) : setConfirm(l.id))}>
                  {confirm === l.id ? "Confirm delete" : "Delete"}
                </button>
              </div>
              {editing?.id === l.id && (
                <div className="stack" style={{ flexBasis: "100%" }}>
                  <AssignPicker students={students} value={editing.ids} idPrefix={`sl-${l.id}`} onChange={(ids) => setEditing({ id: l.id, ids })} />
                  <div className="row"><button className="btn primary sm" disabled={busy === l.id}
                    onClick={() => call(l.id, { method: "PATCH", body: JSON.stringify({ assignedTo: editing.ids }) })}>Save assignment</button></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="err small">{error}</p>}
    </section>
  );
}
