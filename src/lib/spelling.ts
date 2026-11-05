/** Spelling helpers shared by the games (browser) and the server. No server-only imports here. */
import { z } from "zod";

export const isLetter = (ch: string) => /\p{L}/u.test(ch);
export const letterIndexes = (word: string) => [...word].map((c, i) => (isLetter(c) ? i : -1)).filter((i) => i >= 0);
export const sameLetter = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

export const wordSchema = z.object({
  word: z.string().trim().min(1).max(40),
  sentence: z.string().trim().max(300).default(""),
  meaning: z.string().trim().max(200).default(""),
  tricky: z.array(z.number().int().min(0).max(39)).max(40).default([]),
});
export const listDraftSchema = z.object({
  title: z.string().trim().min(1).max(120),
  words: z.array(wordSchema).min(1).max(60),
});
export type WordDraft = z.infer<typeof wordSchema>;
export type ListDraft = z.infer<typeof listDraftSchema>;

/** Keep tricky indexes that point at letters; at least one blank, never every letter. */
export function cleanTricky(word: string, tricky: number[]): number[] {
  const letters = letterIndexes(word);
  let t = [...new Set(tricky)].filter((i) => letters.includes(i)).sort((a, b) => a - b);
  if (t.length >= letters.length) t = t.slice(0, Math.max(1, letters.length - 1));
  if (!t.length) t = guessTricky(word);
  return t;
}

/** Fallback when Claude didn't mark anything: double letters, then vowels inside the word, then a middle letter. */
export function guessTricky(word: string): number[] {
  const chars = [...word], letters = letterIndexes(word);
  if (letters.length <= 1) return letters.slice(0, 1);
  const pick = new Set<number>();
  for (let i = 1; i < chars.length; i++) if (isLetter(chars[i]) && sameLetter(chars[i], chars[i - 1])) { pick.add(i - 1); pick.add(i); }
  const target = Math.max(1, Math.min(4, Math.round(letters.length * 0.3)));
  for (const i of letters) {
    if (pick.size >= target) break;
    if (i > 0 && i < chars.length - 1 && /[aeiouy]/i.test(chars[i])) pick.add(i);
  }
  if (!pick.size) pick.add(letters[Math.floor(letters.length / 2)]);
  return [...pick].filter((i) => letters.includes(i)).sort((a, b) => a - b).slice(0, letters.length - 1);
}

/** Read Claude's blanked pattern ("ne_ess_ry" for "necessary") into letter indexes. */
export function trickyFromPattern(word: string, pattern: string | undefined): number[] {
  if (!pattern) return [];
  const w = [...word], p = [...pattern];
  if (w.length !== p.length) return [];
  const out: number[] = [];
  for (let i = 0; i < w.length; i++) {
    if (p[i] === "_") { if (isLetter(w[i])) out.push(i); }
    else if (!sameLetter(p[i], w[i])) return [];
  }
  return out;
}

/** "ne_ess_ry" for display. */
export const blanked = (word: string, tricky: number[]) => [...word].map((c, i) => (tricky.includes(i) ? "_" : c)).join("");

const CONFUSE: Record<string, string> = {
  a: "eiu", e: "aio", i: "ey", o: "au", u: "oa", y: "ie",
  c: "ks", k: "c", s: "cz", z: "s", f: "v", v: "f", g: "j", j: "g",
  m: "n", n: "m", b: "d", d: "bt", t: "d", p: "b", q: "k", w: "u", x: "k", l: "r", r: "l", h: "w",
};

/** Extra tiles for Word Builder: letters easy to mix up with the ones in the word. */
export function decoys(word: string, rand: () => number = Math.random): string[] {
  const letters = [...word].filter(isLetter).map((c) => c.toLowerCase());
  const n = letters.length >= 8 ? 3 : 2;
  const pool = [...new Set(letters.flatMap((c) => [...(CONFUSE[c] || "")]))];
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  while (out.length < n) out.push("aeiou"[Math.floor(rand() * 5)]);
  return out;
}

/** Long words show on two rows so letter boxes stay big enough to read on a phone. Returns [start, end) ranges. */
export function letterRows(n: number): [number, number][] {
  if (n <= 10) return [[0, n]];
  const h = Math.ceil(n / 2);
  return [[0, h], [h, n]];
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** The sentence with the spelling word hidden, so seeing the clue doesn't give the answer away. */
export function hideWord(sentence: string, word: string): string {
  if (!sentence) return "";
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hidden = sentence.replace(new RegExp(`\\b${esc}\\b`, "gi"), "_____");
  return hidden === sentence ? "" : hidden; // if the exact word isn't in it, don't risk showing a giveaway form
}

/** Split pasted text into words: one per line, or separated by commas/semicolons; strips numbering like "1." */
export function parseWordList(text: string): string[] {
  const parts = text.split(/[\n,;\t]+/).map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
  const seen = new Set<string>(), out: string[] = [];
  for (const p of parts) { const k = p.toLowerCase(); if (!seen.has(k) && p.length <= 40) { seen.add(k); out.push(p); } }
  return out.slice(0, 60);
}

export type Mastery = "new" | "learning" | "mastered";
/** Mastered = right on the first try the last two times. results are newest first. */
export function mastery(results: { firstTry: boolean }[]): Mastery {
  if (!results.length) return "new";
  if (results.length >= 2 && results[0].firstTry && results[1].firstTry) return "mastered";
  return "learning";
}

export const GAMES = {
  builder: { name: "Word Builder", blurb: "Hear the word, tap the letters in order." },
  missing: { name: "Missing Letters", blurb: "Fill in the tricky letters." },
} as const;
export type Game = keyof typeof GAMES;
