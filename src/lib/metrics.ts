/** Thresholds shared by the quiz player and the parent dashboard. */
export const IDLE_MS = 60_000; // no taps or keys for this long counts as idle
export const RUSH_MS = 6_000; // answering faster than this counts as rushed

export type AnswerStats = {
  choice: number | null;
  ms: number;
  changes: number;
  correct: boolean | null;
};
export type AttemptStats = {
  status: "in_progress" | "done";
  awayMs: number;
  awayCount: number;
  idleMs: number;
  score: number | null;
  total: number;
  answers: AnswerStats[];
};
export type Effort = { label: "Focused" | "Mixed" | "Rushed" | "Distracted" | "In progress"; tone: "good" | "warn" | "bad" | "info" };

const median = (arr: number[]) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y), m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export function metrics(a: AttemptStats) {
  const answered = a.answers.filter((x) => x.choice != null);
  const active = a.answers.reduce((s, x) => s + x.ms, 0);
  const total = active + a.awayMs + a.idleMs;
  const rushed = answered.filter((x) => x.ms < RUSH_MS);
  const rushedWrong = rushed.filter((x) => x.correct === false).length;
  const changes = a.answers.reduce((s, x) => s + x.changes, 0);
  const per = answered.length ? active / answered.length : 0;
  const rushShare = answered.length ? rushed.length / answered.length : 0;
  const awayShare = total ? a.awayMs / total : 0;
  const idleShare = total ? a.idleMs / total : 0;

  let effort: Effort = { label: "Focused", tone: "good" };
  if (rushShare >= 0.35) effort = { label: "Rushed", tone: "bad" };
  else if (awayShare >= 0.25 || idleShare >= 0.25) effort = { label: "Distracted", tone: "bad" };
  else if (rushShare >= 0.15 || awayShare >= 0.1 || idleShare >= 0.15) effort = { label: "Mixed", tone: "warn" };
  if (a.status !== "done") effort = { label: "In progress", tone: "info" };

  return {
    answered: answered.length, active, total, per, away: a.awayMs, idle: a.idleMs, awayCount: a.awayCount,
    median: median(answered.map((x) => x.ms)), rushed: rushed.length, rushedWrong, changes, effort,
    pct: a.status === "done" && a.total ? Math.round((100 * (a.score || 0)) / a.total) : null,
  };
}

export function fmtDur(ms: number) {
  const s = Math.round(Math.max(0, ms) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return `${m}m ${String(r).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
export const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
export const fmtClock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const fmtWhen = (d: Date | string | null) => {
  if (!d) return "—";
  const x = new Date(d);
  return x.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
};
export const LETTERS = "ABCD";
