import type { SupabaseClient } from "@supabase/supabase-js";

export type LearnMode = "learn" | "practice" | "shadow" | "test" | "mentor";
export type ExplainLanguage = "Hinglish" | "Hindi" | "English";
export type LearnerLevel = "Beginner" | "Intermediate" | "Advanced";
export type ConceptStatus = "known" | "weak" | "unknown";
export type MistakeCategory =
  | "grammar"
  | "vocabulary"
  | "spelling"
  | "pronunciation"
  | "syntax"
  | "other";

export interface AuthContext {
  userId: string;
  email: string;
  token: string;
  supabase: SupabaseClient;
}

export interface UserProfile {
  id: string;
  full_name: string;
  native_language: string;
  learning_language: string;
  level: LearnerLevel;
  goal: string;
  explain_language: ExplainLanguage;
  voice_preference: string;
  save_history: boolean;
  created_at: string;
  updated_at: string;
}

export interface CorrectionItem {
  original: string;
  corrected: string;
  explanation: string;
  root_cause: string;
  concept: string;
  category: MistakeCategory;
}

export interface MemoryCandidate {
  concept: string;
  status: ConceptStatus;
  confidence: number;
  confusionNote?: string;
}

export interface ConstantNoteCandidate {
  title: string;
  content: string;
  tag: string;
}

export interface InnerCouncilResult {
  reply: string;
  joSahiTha: string;
  corrections: CorrectionItem[];
  nextQuestion: string;
  memoryCandidates: MemoryCandidate[];
  constantNoteCandidate?: ConstantNoteCandidate | null;
  councilNotes: {
    criticSummary: string;
    skepticVerified: boolean;
  };
}

export interface SessionReview {
  summary: string;
  mistakeReview: string[];
  homework: string;
  nextSessionGuidance: string;
  constantNote?: ConstantNoteCandidate | null;
}

export interface PracticeQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  concept: string;
}

export interface ChatMessageRecord {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  mode: LearnMode;
  jo_sahi_tha?: string | null;
  corrections: CorrectionItem[];
  next_question?: string | null;
  created_at: string;
}

export interface LearningSessionRecord {
  id: string;
  user_id: string;
  mode: LearnMode;
  language: string;
  title: string;
  summary?: string | null;
  homework?: string | null;
  next_guidance?: string | null;
  started_at: string;
  ended_at?: string | null;
  created_at: string;
}

export interface GnaniSttResult {
  transcript: string;
  detectedLanguageCode: string;
  model: string;
  processingTime: number;
  latency: number;
}

export interface GnaniTtsResult {
  audioBuffer: Buffer;
  contentType: string;
  voice: string;
  model: string;
}

