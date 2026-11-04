# HaidQuizGenerator (Quiz Desk)

Practice quizzes made from class study guides. A parent uploads photos or a PDF of a study guide, Claude writes 20 multiple-choice questions, the parent reviews and publishes, and the student takes the quiz on any device. Every attempt records how the time was spent so you can tell real study time from clicking through.

**Stack:** Next.js 15 (App Router) on Vercel · Neon Postgres via Drizzle · Clerk sign-in · Claude API for quiz writing.

## What it tracks

For each attempt:

- Total time, focused time (excludes time away and idle stretches), average and median seconds per question
- Rushed answers (under 6 s) and how many of those were wrong
- How many times the student left the page and for how long (tab switch, app switch, phone lock)
- Idle time (no taps or keys for over 60 s)
- Answer changes, number of sittings, score
- An effort label: Focused, Mixed, Rushed or Distracted
- A per-question time chart, colored by right/wrong

Thresholds live in `src/lib/metrics.ts` (`IDLE_MS`, `RUSH_MS`).

The answer key never reaches the student's browser. Grading happens on the server when she submits.

## Deploy

1. **Import the repo in Vercel.** New Project → import `HaidQuizGenerator`. Framework preset: Next.js.
2. **Add Neon.** In the Vercel project: Storage → Create → Neon. This sets `DATABASE_URL`.
3. **Add Clerk.** Create a Clerk application (email sign-in is enough). Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` into Vercel environment variables, and set `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`.
   - Recommended: in Clerk → Restrictions, turn on the allowlist and add only your family's email addresses, so nobody else can sign up.
4. **Set the parent.** Add `PARENT_EMAILS` with your email (comma-separate to add another parent). Anyone else who signs in is a student.
5. **Add the Claude API key.** Create a key at console.anthropic.com and set `ANTHROPIC_API_KEY`. Optional: `ANTHROPIC_MODEL` to change the model (defaults to `claude-sonnet-5-5`).
6. **Create the tables.** On your machine (safe to re-run any time):
   ```bash
   npm install
   DATABASE_URL="<your Neon connection string>" npm run db:push
   ```
   You can copy the connection string from the Neon tab in Vercel.
7. **Deploy, then add your domain.** Vercel → Settings → Domains → add your domain (buy one there, or point a subdomain like `quiz.yourdomain.com` at Vercel with the CNAME it shows). Add the same domain in Clerk → Domains for production.

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
DATABASE_URL="<your Neon connection string>" npm run db:push
npm run dev
```

## Study notes and next rounds

When a quiz is made from uploaded pages, Claude also writes a detailed outline of the study guide (terms, definitions, facts, steps) and tags every question with a topic. Both are saved with the quiz; you can read and correct the notes on the review screen.

**Next round** (Parent → Quizzes, or from an attempt's breakdown) writes 20 new questions from those notes, with no upload. It looks at every finished round from the same guide, collects the questions the student missed or skipped, and aims a share of the new questions (about half by default, adjustable) at those concepts from a different angle. The rest cover the rest of the guide. No earlier question is repeated. The review screen marks which new questions are on missed topics.

Quizzes made before this feature have no notes; their next round is written from the earlier questions instead.

## Assigning quizzes

Each quiz is assigned to every student or to specific students. Pick when you publish, or use **Assign** in the Parent dashboard's Quizzes list. A student appears in the picker once they've accepted their Clerk invite and signed in. Students only see and can open quizzes assigned to them.

## Database changes

Put `DATABASE_URL=...` in `.env.local` once (it's git-ignored). After pulling a change to `src/db/schema.ts`, run `npm run db:push` to update the tables.

## Upload limits

Photos are resized in the browser before upload. Vercel limits a request to 4.5 MB, so a large scanned PDF may need to be split or compressed. Quiz writing usually takes one to two minutes; the route allows up to 5 minutes (`maxDuration` in `src/app/api/generate/route.ts`).

## Project layout

```
src/
  app/
    page.tsx                  student quiz list
    quiz/[id]/                quiz player (time tracking) + server start/resume
    results/[id]/             score and answer review
    parent/                   dashboard, quiz manager
    parent/new/               upload study guide → review draft → publish
    parent/attempts/[id]/     per-attempt breakdown and chart
    api/generate/             sends photos/PDFs to Claude, returns a draft
    api/quizzes/              publish, hide, delete
    api/attempts/[id]/        save progress, submit for grading
  db/schema.ts                quizzes, questions, attempts, attempt_answers
  lib/                        auth roles, metrics, Claude prompt
```
