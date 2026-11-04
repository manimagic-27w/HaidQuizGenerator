// Creates or updates Quiz Desk's tables. Safe to run any number of times.
// Uses Neon's HTTPS driver (the same one the site uses), so it works from any laptop.
// Run with: npm run db:push
import { neon } from "@neondatabase/serverless";

for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile(file); } catch { /* file not present */ }
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL is missing. Add a line DATABASE_URL=\"<Neon connection string>\" to .env.local.");
  process.exit(1);
}

// Keep in step with src/db/schema.ts. Every statement must be safe to re-run.
const steps = [
  ["quizzes table", `CREATE TABLE IF NOT EXISTS "quizzes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL,
    "subject" text DEFAULT '' NOT NULL,
    "created_by" text NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "assigned_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL)`],
  ["quizzes.assigned_to column", `ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "assigned_to" jsonb DEFAULT '[]'::jsonb NOT NULL`],
  ["questions table", `CREATE TABLE IF NOT EXISTS "questions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "quiz_id" uuid NOT NULL,
    "position" integer NOT NULL,
    "prompt" text NOT NULL,
    "choices" jsonb NOT NULL,
    "answer_index" integer NOT NULL,
    "explanation" text DEFAULT '' NOT NULL)`],
  ["attempts table", `CREATE TABLE IF NOT EXISTS "attempts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "quiz_id" uuid,
    "quiz_title" text NOT NULL,
    "student_id" text NOT NULL,
    "student_name" text DEFAULT '' NOT NULL,
    "status" text DEFAULT 'in_progress' NOT NULL,
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "finished_at" timestamp with time zone,
    "away_ms" integer DEFAULT 0 NOT NULL,
    "away_count" integer DEFAULT 0 NOT NULL,
    "idle_ms" integer DEFAULT 0 NOT NULL,
    "sessions" integer DEFAULT 1 NOT NULL,
    "score" integer,
    "total" integer NOT NULL)`],
  ["attempt_answers table", `CREATE TABLE IF NOT EXISTS "attempt_answers" (
    "attempt_id" uuid NOT NULL,
    "position" integer NOT NULL,
    "question_id" uuid,
    "choice" integer,
    "first_choice" integer,
    "changes" integer DEFAULT 0 NOT NULL,
    "ms" integer DEFAULT 0 NOT NULL,
    "visits" integer DEFAULT 0 NOT NULL,
    "correct" boolean,
    CONSTRAINT "attempt_answers_attempt_id_position_pk" PRIMARY KEY("attempt_id","position"))`],
  ...[
    ["attempt_answers_attempt_id_attempts_id_fk", `ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade`],
    ["attempt_answers_question_id_questions_id_fk", `ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE set null`],
    ["attempts_quiz_id_quizzes_id_fk", `ALTER TABLE "attempts" ADD CONSTRAINT "attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null`],
    ["questions_quiz_id_quizzes_id_fk", `ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade`],
  ].map(([name, stmt]) => [`${name}`, `DO $$ BEGIN ${stmt}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`]),
  ["attempts_student_idx", `CREATE INDEX IF NOT EXISTS "attempts_student_idx" ON "attempts" USING btree ("student_id")`],
  ["attempts_started_idx", `CREATE INDEX IF NOT EXISTS "attempts_started_idx" ON "attempts" USING btree ("started_at")`],
  ["questions_quiz_idx", `CREATE INDEX IF NOT EXISTS "questions_quiz_idx" ON "questions" USING btree ("quiz_id")`],
];

const sql = neon(url);
try {
  for (const [label, stmt] of steps) {
    await sql.query(stmt);
    console.log(`✓ ${label}`);
  }
  console.log("\nDatabase is up to date.");
} catch (e) {
  console.error(`\n✗ Database update failed: ${e?.message || e}`);
  if (/fetch failed|ENOTFOUND|getaddrinfo/i.test(String(e?.message) + String(e?.cause))) {
    console.error("  Couldn't reach the database host. Check the DATABASE_URL in .env.local (copy it again from Vercel → Storage → your Neon database).");
  } else if (/password authentication|authentication failed/i.test(String(e?.message))) {
    console.error("  The username or password in DATABASE_URL was rejected. Copy the connection string again from Vercel.");
  }
  process.exit(1);
}
