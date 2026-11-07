import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb, primaryKey, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // new quizzes + next rounds + spelling lists allowed per calendar month; null = no limit
  monthlyLimit: integer("monthly_limit").default(20),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per person. Added by email; user_id fills in the first time they sign in. One family per person. */
export const familyMembers = pgTable("family_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  userId: text("user_id").unique(),
  role: text("role", { enum: ["parent", "child"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("family_members_family_idx").on(t.familyId)]);

/** Every Claude call that counts toward a family's monthly limit. */
export const generations = pgTable("generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  kind: text("kind", { enum: ["quiz", "round", "spelling"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("generations_family_idx").on(t.familyId, t.createdAt)]);

export const quizzes = pgTable("quizzes", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerFamilyId: uuid("owner_family_id").references(() => families.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subject: text("subject").notNull().default(""),
  createdBy: text("created_by").notNull(),
  archived: boolean("archived").notNull().default(false),
  // Clerk user ids of the students who should see this quiz; empty means every student
  assignedTo: jsonb("assigned_to").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  // outline of the original study guide, written when the first quiz was made; later rounds are written from it
  studyNotes: text("study_notes").notNull().default(""),
  // the first quiz in a series of rounds from the same study guide (null on that first quiz itself)
  familyId: uuid("family_id"),
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
  topic: text("topic").notNull().default(""),
}, (t) => [index("questions_quiz_idx").on(t.quizId)]);

export const attempts = pgTable("attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerFamilyId: uuid("owner_family_id").references(() => families.id, { onDelete: "cascade" }),
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

export type Family = typeof families.$inferSelect;
export type FamilyMember = typeof familyMembers.$inferSelect;
export type Quiz = typeof quizzes.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type AttemptAnswer = typeof attemptAnswers.$inferSelect;

/* ---------- spelling ---------- */

export const spellingLists = pgTable("spelling_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerFamilyId: uuid("owner_family_id").references(() => families.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdBy: text("created_by").notNull(),
  archived: boolean("archived").notNull().default(false),
  assignedTo: jsonb("assigned_to").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const spellingWords = pgTable("spelling_words", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").notNull().references(() => spellingLists.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  word: text("word").notNull(),
  sentence: text("sentence").notNull().default(""),
  meaning: text("meaning").notNull().default(""),
  // indexes of the letters Missing Letters blanks out (the tricky parts)
  tricky: jsonb("tricky").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
}, (t) => [index("spelling_words_list_idx").on(t.listId)]);

export const spellingSessions = pgTable("spelling_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerFamilyId: uuid("owner_family_id").references(() => families.id, { onDelete: "cascade" }),
  listId: uuid("list_id").references(() => spellingLists.id, { onDelete: "set null" }),
  listTitle: text("list_title").notNull(),
  studentId: text("student_id").notNull(),
  studentName: text("student_name").notNull().default(""),
  game: text("game", { enum: ["builder", "missing"] }).notNull(),
  status: text("status", { enum: ["in_progress", "done"] }).notNull().default("in_progress"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  awayMs: integer("away_ms").notNull().default(0),
  awayCount: integer("away_count").notNull().default(0),
  idleMs: integer("idle_ms").notNull().default(0),
  total: integer("total").notNull(),
}, (t) => [index("spelling_sessions_student_idx").on(t.studentId), index("spelling_sessions_list_idx").on(t.listId)]);

export const spellingResults = pgTable("spelling_results", {
  sessionId: uuid("session_id").notNull().references(() => spellingSessions.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  wordId: uuid("word_id").references(() => spellingWords.id, { onDelete: "set null" }),
  word: text("word").notNull(),
  firstTry: boolean("first_try").notNull(),
  mistakes: integer("mistakes").notNull().default(0),
  hints: integer("hints").notNull().default(0),
  // what she got wrong: in Word Builder the letters so far plus the wrong tile ("nes…"); in Missing Letters the whole word as typed
  wrong: jsonb("wrong").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  ms: integer("ms").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.sessionId, t.position] })]);

export type SpellingList = typeof spellingLists.$inferSelect;
export type SpellingWord = typeof spellingWords.$inferSelect;
export type SpellingSession = typeof spellingSessions.$inferSelect;
export type SpellingResult = typeof spellingResults.$inferSelect;
