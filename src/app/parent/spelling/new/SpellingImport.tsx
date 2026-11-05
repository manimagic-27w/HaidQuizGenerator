"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Student } from "@/lib/auth";
import AssignPicker from "@/components/AssignPicker";
import { prepare } from "@/lib/imagePrep";
import { cleanTricky, isLetter, parseWordList, type ListDraft } from "@/lib/spelling";

export default function SpellingImport({ students }: { students: Student[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ListDraft | null>(null);
  const [assignedTo, setAssignedTo] = useState<string[]>(students.length === 1 ? [students[0].id] : []);
  const [publishing, setPublishing] = useState(false);
  const typed = parseWordList(text);

  async function prepareList() {
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.append("words", text);
      form.append("note", note);
      for (const f of files) form.append("files", await prepare(f));
      const res = await fetch("/api/spelling/prepare", { method: "POST", body: form });
      const data = await res.json().catch(() => ({ error: "The server didn't answer. Try again." }));
      if (!res.ok) throw new Error(data.error);
      setDraft(data.draft);
    } catch (e) {
      setError((e as Error).message || "Something went wrong. Try again.");
    } finally { setBusy(false); }
  }

  async function publish() {
    if (!draft) return;
    setPublishing(true); setError("");
    const res = await fetch("/api/spelling", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...draft, assignedTo }) });
    if (res.ok) { router.push("/parent"); router.refresh(); return; }
    setError((await res.json().catch(() => ({}))).error || "Couldn't save the list. Try again.");
    setPublishing(false);
  }

  const edit = (i: number, patch: Partial<ListDraft["words"][number]>) =>
    setDraft((d) => d && { ...d, words: d.words.map((w, j) => (j === i ? { ...w, ...patch } : w)) });

  if (draft) {
    return (
      <section className="sheet stack">
        <div className="spread"><h2>Check the words</h2><span className="pill info">{draft.words.length} words</span></div>
        <p className="small muted">Fix any spelling Claude misread. Tap letters to choose which ones Missing Letters hides (dark = hidden). The sentence is read aloud as a clue, with the word left out on screen.</p>
        <div className="field"><label className="label" htmlFor="sp-title">List name</label>
          <input id="sp-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
        <div>
          {draft.words.map((w, i) => (
            <div className="sw" key={i}>
              <div className="spread">
                <div className="row" style={{ gap: 8 }}>
                  <span className="qnum">{i + 1}</span>
                  <input className="sw-word" id={`w${i}`} aria-label={`Word ${i + 1}`} value={w.word} spellCheck={false} autoCapitalize="off"
                    onChange={(e) => edit(i, { word: e.target.value, tricky: cleanTricky(e.target.value, w.tricky) })} />
                </div>
                <button className="btn ghost sm" onClick={() => setDraft({ ...draft, words: draft.words.filter((_, j) => j !== i) })}>Remove</button>
              </div>
              <div className="tricky" aria-label="Letters Missing Letters hides">
                {[...w.word].map((c, k) => isLetter(c) ? (
                  <button key={k} className={`tl ${w.tricky.includes(k) ? "on" : ""}`} aria-pressed={w.tricky.includes(k)}
                    onClick={() => edit(i, { tricky: cleanTricky(w.word, w.tricky.includes(k) ? w.tricky.filter((x) => x !== k) : [...w.tricky, k]) })}>{c}</button>
                ) : <span key={k} className="tl fixed">{c === " " ? " " : c}</span>)}
              </div>
              <div className="row">
                <div className="field"><label className="label" htmlFor={`s${i}`}>Sentence</label>
                  <input id={`s${i}`} value={w.sentence} onChange={(e) => edit(i, { sentence: e.target.value })} /></div>
                <div className="field"><label className="label" htmlFor={`m${i}`}>Meaning</label>
                  <input id={`m${i}`} value={w.meaning} onChange={(e) => edit(i, { meaning: e.target.value })} /></div>
              </div>
            </div>
          ))}
        </div>
        <AssignPicker students={students} value={assignedTo} onChange={setAssignedTo} idPrefix="sp" />
        {error && <p className="err small">{error}</p>}
        <div className="row">
          <button className="btn primary" disabled={publishing || !draft.words.length} onClick={publish}>{publishing ? "Saving…" : "Save spelling list"}</button>
          <button className="btn" disabled={publishing} onClick={() => setDraft(null)}>Start over</button>
        </div>
      </section>
    );
  }

  return (
    <section className="sheet stack">
      <div className="field">
        <label className="label" htmlFor="words">Words</label>
        <textarea id="words" rows={8} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
          placeholder={"One per line, or separated by commas\nnecessary\nseparate\nbelieve"} />
        {typed.length > 0 && <span className="small muted">{typed.length} {typed.length === 1 ? "word" : "words"}</span>}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <label className="drop" htmlFor="sp-files"><b>Or add a photo of the list</b><br /><span className="small muted">A phone picture of the sheet from school works. PDF is fine too.</span></label>
        <input id="sp-files" type="file" accept="image/*,application/pdf" multiple hidden
          onChange={(e) => { setFiles([...files, ...[...(e.target.files || [])]]); e.target.value = ""; }} />
        {files.length > 0 && (
          <div className="files">{files.map((f, i) => (
            <div className="file" key={i}><span>{f.name}</span>
              <button className="btn ghost sm" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button></div>
          ))}</div>
        )}
      </div>
      <div className="field">
        <label className="label" htmlFor="sp-note">Anything to know? (optional)</label>
        <input id="sp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. only the first 15 words; skip the bonus words" />
      </div>
      <div className="row">
        <button className="btn primary" disabled={busy || (!typed.length && !files.length)} onClick={prepareList}>{busy ? "Preparing words…" : "Prepare words"}</button>
      </div>
      {busy && <p className="small muted">Reading the list and writing a sentence for each word. Usually 15 to 40 seconds.</p>}
      {error && <p className="err small">{error}</p>}
    </section>
  );
}
