import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// =====================
// Projects Table
// =====================
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  jdText: text("jd_text"),
  smeNotesText: text("sme_notes_text"),
  competencyRubricJson: jsonb("competency_rubric_json").$type<Competency[]>(),
  screeningQuestionsJson: jsonb("screening_questions_json").$type<ScreeningQuestion[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =====================
// Interviews Table
// =====================
export const interviews = pgTable("interviews", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  candidateName: text("candidate_name").notNull(),
  candidateEmail: text("candidate_email"),
  resumeText: text("resume_text"),
  transcriptJson: jsonb("transcript_json").$type<TranscriptEntry[]>(),
  reportJson: jsonb("report_json").$type<InterviewReport>(),
  notesJson: jsonb("notes_json").$type<InterviewNotes>(),
  status: text("status").notNull().default("draft"),
  consentGiven: boolean("consent_given").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =====================
// Type Definitions
// =====================

export interface Competency {
  id: string;
  name: string;
  description: string;
}

export interface QuestionRubric {
  typicalReasoning: string;
  strongSignals: string[];
  weakSignals: string[];
  notes: string;
}

export interface ScreeningQuestion {
  id: string;
  competencyId: string;
  question: string;
  rubric: QuestionRubric;
  isMandatory: boolean;
  order: number;
  isAsked?: boolean;
}

export interface TranscriptEntry {
  id: string;
  speaker: "interviewer" | "candidate";
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface CompetencyScore {
  competencyId: string;
  name: string;
  score: number;
  reason: string;
}

export interface EvidencePoint {
  point: string;
  competency: string;
  questionId: string | null;
}

export interface InterviewReport {
  summary: string;
  competencies: CompetencyScore[];
  recommendation: {
    decision: "Hire" | "No-Hire" | "Hold";
    reason: string;
  };
  evidence: EvidencePoint[];
  generatedAt: string;
}

export interface InterviewNotes {
  freeformNotes: string;
  competencyRatings: Record<string, number>;
  questionsAsked: string[];
  questionsDismissed: string[];
}

export interface AISuggestion {
  id: string;
  type: "followup" | "new";
  question: string;
  competencyId?: string;
  reason: string;
}

// =====================
// Insert Schemas
// =====================
export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInterviewSchema = createInsertSchema(interviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// =====================
// Types
// =====================
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type Interview = typeof interviews.$inferSelect;
export type InsertInterview = z.infer<typeof insertInterviewSchema>;
