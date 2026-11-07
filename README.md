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
4. **Set the admin.** Add `ADMIN_EMAILS` with your email (comma-separate for more). Admins set up families on the Families page.
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

## Families

Quiz Desk supports several families. Each family only sees its own quizzes, spelling lists and results.

- **Site admin** (emails in `ADMIN_EMAILS`, or `PARENT_EMAILS` on older setups) gets a **Families** tab: create families, set each family's monthly limit, and add people by email as a parent or child. Adding an email sends a Clerk invitation, or links the account right away if that person has already signed up. You can also change roles, move someone to another family, or remove them.
- **Parents** see the Parent dashboard for their own family only. **Children** see what's assigned to them.
- One family per person. Someone signed in but not in a family sees a "not set up yet" page.
- **Monthly limit:** new quizzes, next rounds and spelling lists count against it (those use the Claude API). Blank = no limit. Resets on the 1st (Eastern time). Parents see how many are left on their dashboard.

**Upgrading from one family:** after `npm run db:push`, the first sign-in moves every existing account into one family named `FIRST_FAMILY_NAME` (default "My family", rename it on the Families page). People in `PARENT_EMAILS`/`ADMIN_EMAILS` become its parents and everyone else its children, and all existing quizzes, spelling lists and results go with it. That family starts with no limit.

Keep Clerk on **Invite-only** so only people you add can sign up.

## Study notes and next rounds

When a quiz is made from uploaded pages, Claude also writes a detailed outline of the study guide (terms, definitions, facts, steps) and tags every question with a topic. Both are saved with the quiz; you can read and correct the notes on the review screen.

**Next round** (Parent → Quizzes, or from an attempt's breakdown) writes 20 new questions from those notes, with no upload. It looks at every finished round from the same guide, collects the questions the student missed or skipped, and aims a share of the new questions (about half by default, adjustable) at those concepts from a different angle. The rest cover the rest of the guide. No earlier question is repeated. The review screen marks which new questions are on missed topics.

Quizzes made before this feature have no notes; their next round is written from the earlier questions instead.

## Spelling games

**Parent → New spelling list**: type or paste the words, or add a photo/PDF of the list from school. Claude writes a kid-friendly sentence and meaning for each word and marks its tricky letters (double letters, silent letters, vowel teams, -tion…). On the review screen you can fix any word and tap letters to change which ones are hidden. Assign the list like a quiz.

Each list has two games, read aloud with the browser's built-in voice:

- **Word Builder**: hear the word, tap scrambled letter tiles in order. Two or three decoy letters (easy mix-ups like c/k/s) are mixed in. Wrong tiles shake and bounce back. Typing on a keyboard works too.
- **Missing Letters**: the word with its tricky letters blanked. Fill them in; two wrong tries show the answer.

Any word with a slip comes back once at the end of the game. The sentence clue is shown with the word hidden.

**Progress** (Parent dashboard → Spelling → Progress) shows each word as Not tried, Practicing, or Mastered (right on the first try the last two times), the actual misspellings, and every game with time, hints and time away.

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
