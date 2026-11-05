"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { isLetter, letterRows, sameLetter } from "@/lib/spelling";
import type { GameApi } from "./GameShell";

/** The word with its tricky letters blanked. Two wrong checks reveal the answer; the word then comes back at the end. */
export default function MissingLetters({ word, tricky, api, solved }: { word: string; tricky: number[]; api: GameApi; solved: boolean }) {
  const chars = useMemo(() => [...word], [word]);
  const blanks = useMemo(() => tricky.filter((i) => i < chars.length && isLetter(chars[i])).sort((a, b) => a - b), [tricky, chars]);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [bad, setBad] = useState<number[]>([]);
  const [shake, setShake] = useState(false);
  const [tries, setTries] = useState(0);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [right, setRight] = useState(false);
  const refs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => { refs.current[blanks[0]]?.focus(); }, [blanks]);

  const focusBlank = (i: number | undefined) => { if (i != null) refs.current[i]?.focus(); };

  function check(v: Record<number, string>) {
    const wrong = blanks.filter((i) => !sameLetter(v[i] || "", chars[i]));
    if (!wrong.length) { setRight(true); setBad([]); api.onSolved(); return; }
    api.onMistake(chars.map((c, i) => (blanks.includes(i) ? (v[i] || "_") : c)).join(""));
    const n = tries + 1;
    setTries(n);
    setBad(wrong);
    setShake(true); setTimeout(() => setShake(false), 450);
    if (n >= 2) { setShowAnswer(true); return; }
    // keep the right letters, clear the wrong ones
    setVals((cur) => { const c = { ...cur }; wrong.forEach((i) => delete c[i]); return c; });
    focusBlank(wrong[0]);
  }

  function type(i: number, raw: string) {
    const ch = [...raw].filter(isLetter).pop() || "";
    const v = { ...vals, [i]: ch };
    setVals(v);
    setBad((b) => b.filter((x) => x !== i));
    if (!ch) return;
    const nextEmpty = blanks.find((b) => b > i && !v[b]) ?? blanks.find((b) => !v[b]);
    if (nextEmpty != null) focusBlank(nextEmpty);
    else check(v); // last blank filled: check right away
  }

  function key(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    const k = blanks.indexOf(i);
    if (e.key === "Backspace" && !vals[i] && k > 0) { e.preventDefault(); focusBlank(blanks[k - 1]); }
    if (e.key === "ArrowLeft" && k > 0) focusBlank(blanks[k - 1]);
    if (e.key === "ArrowRight" && k < blanks.length - 1) focusBlank(blanks[k + 1]);
    if (e.key === "Enter" && blanks.every((b) => vals[b])) check(vals);
  }

  function hint() {
    const i = blanks.find((b) => !sameLetter(vals[b] || "", chars[b]));
    if (i == null) return;
    api.onHint();
    const v = { ...vals, [i]: chars[i] };
    setVals(v); setRevealed((r) => [...r, i]); setBad((b) => b.filter((x) => x !== i));
    const nextEmpty = blanks.find((b) => !v[b]);
    if (nextEmpty != null) focusBlank(nextEmpty); else check(v);
  }

  const locked = solved || right || showAnswer;

  return (
    <div className="stack" style={{ gap: 18, alignItems: "center" }}>
      <div style={{ "--n": Math.max(...letterRows(chars.length).map(([a, b]) => b - a)) } as React.CSSProperties}
        className={`slots ${right ? "win" : ""} ${shake ? "shake" : ""}`}>
        {letterRows(chars.length).map(([a, b]) => (
          <div className="slot-row" key={a}>
            {chars.slice(a, b).map((c, k) => { const i = a + k;
              if (!blanks.includes(i)) return <span key={i} className={`slot given ${!isLetter(c) ? "fixed" : ""}`}>{c === " " ? " " : c}</span>;
              if (showAnswer) return <span key={i} className="slot answer">{c}</span>;
              return (
                <input key={i} ref={(el) => { refs.current[i] = el; }} id={`blank-${i}`}
                  className={`slot blank ${bad.includes(i) ? "bad" : ""} ${revealed.includes(i) ? "hinted" : ""} ${right ? "filled" : ""}`}
                  value={vals[i] || ""} disabled={locked} maxLength={2} inputMode="text" autoComplete="off" autoCorrect="off"
                  autoCapitalize="off" spellCheck={false} aria-label={`Missing letter ${blanks.indexOf(i) + 1} of ${blanks.length}`}
                  onChange={(e) => type(i, e.target.value)} onKeyDown={(e) => key(i, e)} onFocus={(e) => e.target.select()} />
              );
            })}
          </div>
        ))}
      </div>
      {showAnswer ? (
        <div className="stack" style={{ alignItems: "center", gap: 8 }}>
          <p>The tricky letters are in blue. Look at the word, then keep going. It&apos;ll come back at the end.</p>
          <button className="btn primary" disabled={solved} onClick={() => api.onSolved()}>Got it</button>
        </div>
      ) : (
        <div className="row" style={{ justifyContent: "center" }}>
          {bad.length > 0 && <span className="small err">{tries === 1 ? "Not quite. Try the red ones again." : ""}</span>}
          {!locked && <button className="btn ghost sm" onClick={hint}>Fill in one letter for me</button>}
        </div>
      )}
    </div>
  );
}
