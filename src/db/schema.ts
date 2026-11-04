import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb, primaryKey, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const quizzes = pgTable("quizzes", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  subject: text("subject").notNull().default(""),
  createdBy: text("created_by").notNull(),
  archived: boolean("archived").notNull().default(false),
  // Clerk user ids of the students who should see this quiz; empty means every student
  assignedTo: jsonb("assigned_to").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  quizId: uuid("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  prompt: text("prompt").notNull(),
  choices: jsonb("choices").$type<string[]>().notNull(),
  answerIndex: integer("answer_index").notNull(),
  explanation: text("explanation").notNull().default(""),
}, (t) => [index("questions_quiz_idx").on(t.quizId)]);

export const attempts = pgTable("attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  // kept when a quiz is deleted so results and time stats survive
  quizId: uuid("quiz_id").references(() => quizzes.id, { onDelete: "set null" }),
  quizTitle: text("quiz_title").notNull(),
  studentId: text("student_id").notNull(),
  studentName: text("student_name").notNull().default(""),
  status: text("status", { enum: ["in_progress", "done"] }).notNull().default("in_progress"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  awayMs: integer("away_ms").notNull().default(0),
  awayCount: integer("away_count").notNull().default(0),
  idleMs: integer("idle_ms").notNull().default(0),
  sessions: integer("sessions").notNull().default(1),
  score: integer("score"),
  total: integer("total").notNull(),
}, (t) => [index("attempts_student_idx").on(t.studentId), index("attempts_started_idx").on(t.startedAt)]);

export const attemptAnswers = pgTable("attempt_answers", {
  attemptId: uuid("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  questionId: uuid("question_id").references(() => questions.id, { onDelete: "set null" }),
  choice: integer("choice"),
  firstChoice: integer("first_choice"),
  changes: integer("changes").notNull().default(0),
  ms: integer("ms").notNull().default(0),
  visits: integer("visits").notNull().default(0),
  correct: boolean("correct"),
}, (t) => [primaryKey({ columns: [t.attemptId, t.position] })]);

export type Quiz = typeof quizzes.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type AttemptAnswer = typeof attemptAnswers.$inferSelect;
