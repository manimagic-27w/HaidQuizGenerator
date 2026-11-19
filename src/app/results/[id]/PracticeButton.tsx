"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Makes the student's one practice quiz for this quiz, then opens it. */
export default function PracticeButton({ quizId, missed }: { quizId: string; missed: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now(), id = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  async function make() {
    setBusy(true); setError(""); setSecs(0);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/practice`, { method: "POST" });
      const data = await res.json().catch(() => ({ error: "Something went wrong. Try again." }));
      if (!res.ok) throw new Error(data.error);
      router.push(`/quiz/${data.id}`);
    } catch (e) {
      setError((e as Error).message); setBusy(false);
    }
  }

  return (
    <section className="sheet stack practice">
      <h2>Want more practice?</h2>
      <p>Make a practice quiz with 20 new questions{missed ? <>, about half on the {missed === 1 ? "question" : "kinds of questions"} you missed</> : " on this study guide"}. You can make one practice quiz for this quiz.</p>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={make}>{busy ? "Writing your quiz…" : "Make my practice quiz"}</button>
        {busy && <span className="small muted">This takes about a minute. <span className="mono">{secs}s</span></span>}
      </div>
      {error && <p className="err small">{error}</p>}
    </section>
  );
}
