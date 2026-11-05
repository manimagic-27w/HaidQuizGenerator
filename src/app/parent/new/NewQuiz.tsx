"use client";

import { useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/generate";
import type { Student } from "@/lib/auth";
import DraftReview from "@/components/DraftReview";
import { prepare } from "@/lib/imagePrep";

type Picked = { file: File; preview: string | null };
export default function NewQuiz({ students }: { students: Student[] }) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [over, setOver] = useState(false);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => () => picked.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), [picked]);
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - t0), 1000);
    return () => clearInterval(id);
  }, [busy]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const ok = [...list].filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    setError(ok.length < list.length ? "Some files were skipped. Use photos (JPG or PNG) or PDFs." : "");
    setPicked((p) => [...p, ...ok.map((file) => ({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }))]);
  }

  async function generate() {
    setBusy(true); setError(""); setElapsed(0);
    ctl.current = new AbortController();
    try {
      const form = new FormData();
      for (const p of picked) form.append("files", await prepare(p.file));
      form.append("focus", focus);
      const res = await fetch("/api/generate", { method: "POST", body: form, signal: ctl.current.signal });
      const data = await res.json().catch(() => ({ error: res.status === 413 ? "The files are too large. Use fewer pages or a smaller PDF." : "The server didn't answer. Try again." }));
      if (!res.ok) throw new Error(data.error);
      setDraft(data.draft);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message || "Something went wrong. Try again.");
    } finally {
      setBusy(false); ctl.current = null;
    }
  }

  if (draft) {
    return <DraftReview initial={draft} students={students} onDiscard={() => setDraft(null)}
      defaultAssignees={students.length === 1 ? [students[0].id] : []} />;
  }

  return (
    <section className="sheet stack">
      <label
        className={`drop ${over ? "over" : ""}`} htmlFor="files"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
        <b>Choose photos or a PDF</b><br />
        <span className="small muted">or drop them here. Include every page of the guide.</span>
      </label>
      <input id="files" type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      {picked.length > 0 && (
        <div className="files">
          {picked.map((p, i) => (
            <div className="file" key={i}>
              {p.preview ? <img src={p.preview} alt="" /> : <span className="pill info">PDF</span>}
              <span>{p.file.name}</span>
              <button className="btn ghost sm" aria-label={`Remove ${p.file.name}`} disabled={busy}
                onClick={() => setPicked(picked.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor="focus">Anything to focus on? (optional)</label>
        <input id="focus" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. vocabulary from section 4.2, skip the map questions" />
      </div>
      <div className="row">
        <button className="btn primary" disabled={!picked.length || busy} onClick={generate}>{busy ? "Writing questions…" : "Write 20 questions"}</button>
        {busy && <button className="btn" onClick={() => ctl.current?.abort()}>Stop</button>}
      </div>
      {busy && <p className="small muted">Reading the study guide and writing questions. This usually takes one to two minutes. <span className="mono">{Math.floor(elapsed / 1000)}s</span></p>}
      {error && <p className="err small">{error}</p>}
    </section>
  );
}
