"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Draft } from "@/lib/generate";
import { LETTERS } from "@/lib/metrics";
import type { Student } from "@/lib/auth";
import AssignPicker from "@/components/AssignPicker";

type Picked = { file: File; preview: string | null };
const MAX_EDGE = 1800; // px; keeps phone photos readable but small enough to upload

/** Shrink phone photos to a JPEG that fits under the upload limit. PDFs pass through untouched. */
async function prepare(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 900_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
}

export default function NewQuiz({ students }: { students: Student[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [over, setOver] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string[]>(students.length === 1 ? [students[0].id] : []);
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

  async function publish() {
    if (!draft) return;
    setPublishing(true); setError("");
    const res = await fetch("/api/quizzes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...draft, assignedTo }) });
    if (res.ok) { router.push("/parent"); router.refresh(); return; }
    const data = await res.json().catch(() => ({}));
    setError(data.error || "Couldn't publish the quiz. Try again.");
    setPublishing(false);
  }

  const editQ = (i: number, patch: Partial<Draft["questions"][number]>) =>
    setDraft((d) => d && { ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });

  if (draft) {
    return (
      <section className="sheet stack">
        <div className="spread"><h2>Check the questions</h2><span className="pill info">{draft.questions.length} questions</span></div>
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
              <div className="spread"><span className="qnum">Q{i + 1}</span>
                <button className="btn ghost sm" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })}>Remove</button></div>
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
        <AssignPicker students={students} value={assignedTo} onChange={setAssignedTo} idPrefix="new" />
        {error && <p className="err small">{error}</p>}
        <div className="row">
          <button className="btn primary" disabled={publishing || !draft.questions.length} onClick={publish}>{publishing ? "Publishing…" : "Publish quiz"}</button>
          <button className="btn" onClick={() => setDraft(null)} disabled={publishing}>Start over</button>
        </div>
      </section>
    );
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
