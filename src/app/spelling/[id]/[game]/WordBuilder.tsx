"use client";

import React, { useEffect, useMemo, useState } from "react";
import { decoys, isLetter, letterRows, sameLetter, shuffle } from "@/lib/spelling";
import type { GameApi } from "./GameShell";

type Tile = { id: number; ch: string; used: boolean };

/** Hear the word, tap letter tiles in order. Wrong tiles bounce back; a few extra letters don't belong. */
export default function WordBuilder({ word, api, solved }: { word: string; api: GameApi; solved: boolean }) {
  const chars = useMemo(() => [...word], [word]);
  const firstSlot = (from: number) => { let i = from; while (i < chars.length && !isLetter(chars[i])) i++; return i; };
  const [next, setNext] = useState(() => firstSlot(0));
  const [tiles, setTiles] = useState<Tile[]>(() =>
    shuffle([...chars.filter(isLetter).map((c) => c.toLowerCase()), ...decoys(word)]).map((ch, id) => ({ id, ch, used: false })));
  const [shake, setShake] = useState<number | null>(null);
  const [glow, setGlow] = useState<number | null>(null);
  const done = next >= chars.length;

  function pick(tile: Tile) {
    if (done || solved || tile.used) return;
    if (sameLetter(tile.ch, chars[next])) {
      setTiles((ts) => ts.map((t) => (t.id === tile.id ? { ...t, used: true } : t)));
      setGlow(null);
      const n = firstSlot(next + 1);
      setNext(n);
      if (n >= chars.length) api.onSolved();
    } else {
      api.onMistake(`${chars.slice(0, next).join("")}${tile.ch}…`);
      setShake(tile.id);
      setTimeout(() => setShake((s) => (s === tile.id ? null : s)), 450);
    }
  }

  function hint() {
    if (done || solved) return;
    const t = tiles.find((x) => !x.used && sameLetter(x.ch, chars[next]));
    if (!t) return;
    api.onHint();
    setGlow(t.id);
  }

  // Typing on a keyboard picks the matching tile.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || !isLetter(e.key)) return;
      const right = tiles.find((x) => !x.used && sameLetter(x.ch, e.key) && sameLetter(x.ch, chars[next] || ""));
      const any = tiles.find((x) => !x.used && sameLetter(x.ch, e.key));
      if (right) pick(right);
      else if (any) pick(any);
      else if (!done && !solved) { api.onMistake(`${chars.slice(0, next).join("")}${e.key.toLowerCase()}…`); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="stack" style={{ gap: 18, alignItems: "center" }}>
      <div style={{ "--n": Math.max(...letterRows(chars.length).map(([a, b]) => b - a)) } as React.CSSProperties}
        className={`slots ${done ? "win" : ""}`} aria-label={`Word so far: ${chars.slice(0, next).join("")}`}>
        {letterRows(chars.length).map(([a, b]) => (
          <div className="slot-row" key={a}>
            {chars.slice(a, b).map((c, k) => { const i = a + k; return !isLetter(c)
              ? <span key={i} className="slot fixed">{c === " " ? "\u00a0" : c}</span>
              : <span key={i} className={`slot ${i < next ? "filled" : ""} ${i === next ? "cur" : ""}`}>{i < next ? c : ""}</span>; })}
          </div>
        ))}
      </div>
      <div className="tiles">
        {tiles.map((t) => (
          <button key={t.id} className={`tile ${t.used ? "used" : ""} ${shake === t.id ? "shake" : ""} ${glow === t.id ? "glow" : ""}`}
            disabled={t.used || done || solved} onClick={() => pick(t)} aria-label={`Letter ${t.ch}`}>{t.ch}</button>
        ))}
      </div>
      {!done && <button className="btn ghost sm" onClick={hint}>Show me the next letter</button>}
    </div>
  );
}
