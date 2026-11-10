export type LearnMode = "learn" | "practice" | "shadow" | "test" | "mentor";
export type ExplainLanguage = "Hinglish" | "Hindi" | "English";
export type LearnerLevel = "Beginner" | "Intermediate" | "Advanced";

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
  root_cause: string;
  concept: string;
  category?: string;
}

export interface TutorMessage {
  id: string;
  session_id?: string;
  role: "user" | "assistant";
  content: string;
  mode: string;
  jo_sahi_tha?: string | null;
  joSahiTha?: string | null;
  corrections: Correction[];
  next_question?: string | null;
  nextQuestion?: string | null;
  created_at: string;
  privacyWarning?: string;
  persistenceWarning?: string;
}

export interface UserProfile {
  id: string;
  email: string;
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

export interface LearningSession {
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
}

export interface SessionReview {
  summary: string;
  mistakeReview: string[];
  homework: string;
  nextSessionGuidance: string;
  constantNote?: { title: string; content: string; tag: string } | null;
}

export interface ConstantNote {
  id: string;
  language: string;
  tag: string;
  title: string;
  content: string;
  created_at: string;
}

export interface LearnerConcept {
  id: string;
  language: string;
  concept: string;
  status: "known" | "weak" | "unknown";
  confidence: number;
  error_count: number;
  confusion_note: string;
  last_practiced: string;
  next_review_at?: string | null;
}

export interface MistakeRecord {
  id: string;
  original: string;
  corrected: string;
  original_text?: string;
  corrected_text?: string;
  explanation: string;
  category: string;
  root_cause: string;
  concept: string;
  created_at: string;
}

export interface MistakePattern {
  id: string;
  pattern_key: string;
  category: string;
  root_cause: string;
  occurrence_count: number;
  practice_status: string;
  example_original: string;
  example_corrected: string;
  first_observed_at: string;
  last_observed_at: string;
}

export interface MemoryCard {
  id: string;
  language: string;
  version: number;
  card_content: {
    strengths?: string[];
    focusAreas?: Array<{ concept: string; status: string; confidence: number }>;
    topPatterns?: Array<{ pattern_key: string; occurrence_count: number }>;
    recentNotes?: Array<{ title: string; tag: string }>;
    generatedAt?: string;
  };
  created_at: string;
}

export interface TimeCapsuleItem {
  id: string;
  content: string;
  target_language: string;
  reminder_at: string;
  opened_at?: string | null;
  created_at: string;
}

export interface PracticeQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  concept: string;
}

export interface WeeklyReportPayload {
  analytics: {
    periodStart: string;
    periodEnd: string;
    totalMessages: number;
    userMessages: number;
    assistantReplies: number;
    accuracyPercent: number | null;
    sessionsCount: number;
    dailyBreakdown: Array<{ date: string; day: string; messages: number; accuracy: number | null }>;
    topConcepts: Array<{ concept: string; errors: number }>;
    dueForReviewCount: number;
    dueTimeCapsulesCount: number;
  };
  recentSessionReports: Array<{
    id: string;
    created_at: string;
    summary: SessionReview;
  }>;
}

export interface VoiceConfig {
  configured: boolean;
  sttModel: string;
  ttsModel: string;
  defaultVoice: string;
  voices: Array<{ id: string; label: string; gender: string }>;
  supportedLanguages: Array<{ name: string; code: string }>;
}

export interface HealthStatus {
  status: string;
  service: string;
  providers: {
    geminiConfigured: boolean;
    geminiModel: string;
    gnaniConfigured: boolean;
    gnaniSttModel: string;
    gnaniTtsModel: string;
    supabaseConfigured: boolean;
  };
}
