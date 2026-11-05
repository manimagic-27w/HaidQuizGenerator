"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IDLE_MS } from "@/lib/metrics";
import { GAMES, hideWord, type Game } from "@/lib/spelling";
import WordBuilder from "./WordBuilder";
import MissingLetters from "./MissingLetters";

export type PlayWord = { id: string; word: string; sentence: string; meaning: string; tricky: number[] };
type Result = { firstTry: boolean; mistakes: number; hints: number; wrong: string[]; ms: number; done: boolean };
export type GameApi = { onMistake: (wrong: string) => void; onHint: () => void; onSolved: () => void };

const Speaker = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);

const CHEERS = ["Nice!", "You got it!", "Awesome!", "Spot on!", "Nailed it!", "Super!", "Yes!"];

/** Reads words aloud with the browser's built-in voice. */
function useSpeech() {
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
      voice.current = vs.find((v) => /samantha|google us english|aria|jenny/i.test(v.name)) || vs.find((v) => /en-US/i.test(v.lang)) || vs[0] || null;
      setOk(true);
    };
    pick();
    speechSynthesis.addEventListener("voiceschanged", pick);
    return () => speechSynthesis.removeEventListener("voiceschanged", pick);
  }, []);
  const say = useCallback((text: string, rate = 0.85) => {
    if (!("speechSynthesis" in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice.current) u.voice = voice.current;
    u.rate = rate; u.lang = voice.current?.lang || "en-US";
    speechSynthesis.speak(u);
  }, []);
  return { say, ok };
}

export default function GameShell({ game, listId, title, sessionId, otherGame, words }: {
  game: Game; listId: string; title: string; sessionId: string | null; otherGame: Game; words: PlayWord[];
}) {
  const { say, ok: speechOk } = useSpeech();
  const [phase, setPhase] = useState<"intro" | "play" | "done">("intro");
  const [queue, setQueue] = useState<{ pos: number; retry: boolean }[]>(words.map((_, pos) => ({ pos, retry: false })));
  const [step, setStep] = useState(0);
  const [streak, setStreak] = useState(0);
  const [cheer, setCheer] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState("");
  const [, setTick] = useState(0);
  const res = useRef<Result[]>(words.map(() => ({ firstTry: true, mistakes: 0, hints: 0, wrong: [], ms: 0, done: false })));
  const slipsAtStart = useRef(0); // mistakes + hints on this word when it came up, so a clean retry counts as clean
  const t = useRef({ cur: 0, segStart: 0, lastInput: 0, away: false, awayStart: 0, awayMs: 0, awayCount: 0, idleMs: 0, playing: false });

  const flush = useCallback(() => {
    const s = t.current, now = performance.now();
    if (!s.playing || s.away) { s.segStart = now; return; }
    const idleFrom = s.lastInput + IDLE_MS;
    let active = now - s.segStart, idle = 0;
    if (idleFrom < now) { active = Math.max(0, idleFrom - s.segStart); idle = now - Math.max(s.segStart, idleFrom); }
    res.current[s.cur].ms += active; s.idleMs += idle; s.segStart = now;
  }, []);

  const saving = useRef<Promise<void>>(Promise.resolve());
  const save = useCallback((done = false, keepalive = false) => {
    if (!sessionId) return Promise.resolve();
    flush();
    const s = t.current;
    const body = JSON.stringify({
      results: res.current.map((r, position) => ({ r, position })).filter(({ r }) => r.done || r.mistakes || r.hints)
        .map(({ r, position }) => ({ position, wordId: words[position].id, word: words[position].word, firstTry: r.firstTry, mistakes: r.mistakes, hints: r.hints, wrong: r.wrong.slice(-30), ms: Math.round(r.ms) })),
      awayMs: Math.round(s.awayMs), awayCount: s.awayCount, idleMs: Math.round(s.idleMs), done,
    });
    saving.current = saving.current.then(async () => {
      try {
        const r = await fetch(`/api/spelling/sessions/${sessionId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body, keepalive });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't save");
        setSaveErr("");
      } catch (e) { setSaveErr(`Not saved yet: ${(e as Error).message}. It'll try again after the next word.`); }
    });
    return saving.current;
  }, [sessionId, words, flush]);

  // activity, away and idle tracking (same rules as quizzes)
  useEffect(() => {
    const s = t.current;
    const onInput = () => { flush(); s.lastInput = performance.now(); };
    const goAway = () => { if (!s.playing || s.away) return; flush(); s.away = true; s.awayStart = performance.now(); s.awayCount++; save(false, true); };
    const comeBack = () => { if (!s.away) return; const n = performance.now(); s.awayMs += n - s.awayStart; s.away = false; s.segStart = n; s.lastInput = n; };
    const onVis = () => (document.hidden ? goAway() : comeBack());
    const evs = ["pointerdown", "pointermove", "keydown", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", goAway); window.addEventListener("focus", comeBack); window.addEventListener("pagehide", goAway);
    const id = setInterval(() => { flush(); setTick((x) => x + 1); }, 1000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, onInput));
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", goAway); window.removeEventListener("focus", comeBack); window.removeEventListener("pagehide", goAway);
      clearInterval(id);
    };
  }, [flush, save]);

  const item = queue[step];
  const w = item ? words[item.pos] : null;
  const clue = w ? hideWord(w.sentence, w.word) : "";

  // Say each new word once it appears.
  useEffect(() => {
    if (phase !== "play" || !w) return;
    flush(); t.current.cur = item.pos;
    slipsAtStart.current = res.current[item.pos].mistakes + res.current[item.pos].hints;
    const id = setTimeout(() => say(w.word), 350);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step]);

  function start() {
    const n = performance.now();
    Object.assign(t.current, { playing: true, segStart: n, lastInput: n, cur: queue[0].pos });
    setPhase("play");
  }

  const api: GameApi = {
    onMistake: (wrong) => { const r = res.current[item.pos]; r.mistakes++; r.firstTry = false; if (wrong) r.wrong.push(wrong); setStreak(0); },
    onHint: () => { const r = res.current[item.pos]; r.hints++; r.firstTry = false; setStreak(0); },
    onSolved: () => {
      flush();
      const r = res.current[item.pos];
      const clean = r.mistakes + r.hints === slipsAtStart.current;
      r.done = true;
      if (clean) setStreak((x) => x + 1);
      setCheer(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
      say(w!.word, 0.95);
      // Words with any slip come back once at the end.
      const add = !item.retry && !r.firstTry ? [{ pos: item.pos, retry: true }] : [];
      const nextQueue = [...queue, ...add];
      save();
      setTimeout(() => {
        setCheer(null);
        if (step + 1 >= nextQueue.length) { t.current.playing = false; flush(); setPhase("done"); save(true); }
        else { setQueue(nextQueue); setStep(step + 1); }
      }, 1300);
    },
  };

  if (phase === "intro") {
    return (
      <section className="sp-intro">
        <div className="label">{title}</div>
        <h1>{GAMES[game].name}</h1>
        <p className="muted">{GAMES[game].blurb} {words.length} words.{" "}
          {game === "builder" ? "Watch out for extra letters that don't belong!" : "Only the tricky letters are missing."}</p>
        <p className="small muted">{speechOk ? "Turn your sound on. Each word is read out loud. Tap the speaker to hear it again." : "This browser can't read words aloud, so use the sentence clue."}</p>
        {!sessionId && <p className="pill hi" style={{ alignSelf: "center" }}>Parent preview: nothing is saved</p>}
        <button className="btn primary big" onClick={start}>Start</button>
        <Link href="/" className="small">Back</Link>
      </section>
    );
  }

  if (phase === "done") {
    const firstTry = res.current.filter((r) => r.firstTry).length;
    const practice = words.filter((_, i) => !res.current[i].firstTry);
    const pct = firstTry / words.length;
    const stars = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : 1;
    return (
      <section className="sheet stack sp-done">
        <div className="stars" aria-label={`${stars} of 3 stars`}>{[0, 1, 2].map((i) => <span key={i} className={i < stars ? "on" : ""}>★</span>)}</div>
        <h1>{stars === 3 ? "Amazing spelling!" : stars === 2 ? "Great work!" : "Good practice!"}</h1>
        <p><b className="mono">{firstTry}</b> of {words.length} right on the first try.</p>
        {practice.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="label">Words to practice</div>
            <div className="topics">{practice.map((p) => <button key={p.id} className="pill warn" onClick={() => say(p.word)}>{p.word} <Speaker /></button>)}</div>
          </div>
        )}
        {saveErr && <p className="err small">{saveErr}</p>}
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn primary" onClick={() => window.location.reload()}>Play again</button>
          <Link className="btn" href={`/spelling/${listId}/${otherGame}`} prefetch={false}>Try {GAMES[otherGame].name}</Link>
          <Link className="btn ghost" href="/">Done</Link>
        </div>
      </section>
    );
  }

  const progress = (100 * step) / queue.length;
  return (
    <div className="stack sp-play" style={{ gap: 16 }}>
      <div className="qhead">
        <div><div className="label">{title}</div><h2>{GAMES[game].name}</h2></div>
        <div className="row">
          {streak >= 2 && <span className="pill hi streak">{streak} in a row!</span>}
          <Link className="btn ghost sm" href="/" onClick={() => { flush(); save(); }}>Quit</Link>
        </div>
      </div>
      <div className="bar" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
      <div className="small muted">{item.retry ? "One more try on this one" : `Word ${step + 1} of ${words.length}`}</div>

      <div className="sp-card">
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn primary say" onClick={() => say(w!.word)} aria-label="Hear the word"><Speaker /> Hear the word</button>
          {w!.sentence && <button className="btn" onClick={() => say(`${w!.word}. ${w!.sentence}`)}>Hear it in a sentence</button>}
        </div>
        {clue ? <p className="clue">&ldquo;{clue}&rdquo;</p> : w!.meaning ? <p className="clue">Means: {w!.meaning}</p> : null}
        {clue && w!.meaning && <p className="small muted" style={{ textAlign: "center" }}>Means: {w!.meaning}</p>}

        {game === "builder"
          ? <WordBuilder key={`${step}`} word={w!.word} api={api} solved={!!cheer} />
          : <MissingLetters key={`${step}`} word={w!.word} tricky={w!.tricky} api={api} solved={!!cheer} />}

        <div className="cheer" aria-live="polite">{cheer && <span>{cheer}</span>}</div>
      </div>
      {saveErr && <p className="err small">{saveErr}</p>}
    </div>
  );
}
