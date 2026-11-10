import { supabase } from "@/integrations/supabase/client";
import type {
  ConstantNote,
  ExplainLanguage,
  HealthStatus,
  LearnerConcept,
  LearningSession,
  LearnMode,
  MemoryCard,
  MistakePattern,
  MistakeRecord,
  PracticeQuestion,
  SessionReview,
  TimeCapsuleItem,
  TutorMessage,
  UserProfile,
  VoiceConfig,
  WeeklyReportPayload,
} from "@/types/api";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");

async function getAuthHeaders(extra: Record<string, string> = {}): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders({
    ...(init.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(init.headers as Record<string, string> | undefined),
  });

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    try {
      const payload = (await res.json()) as { error?: { message?: string }; message?: string };
      errMsg = payload.error?.message || payload.message || errMsg;
    } catch {
      // ignore non-json error bodies
    }
    throw new Error(errMsg);
  }

  const json = (await res.json()) as { success: boolean; data: T };
  return json.data;
}

export const api = {
  health: () => requestJson<HealthStatus>("/health"),

  // Profile
  getProfile: () => requestJson<UserProfile>("/profile"),
  updateProfile: (payload: Partial<UserProfile>) =>
    requestJson<UserProfile>("/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getSchemaSql: () => requestJson<{ filename: string; sql: string }>("/profile/schema-sql"),

  // Sessions
  createSession: (payload: { mode: LearnMode; language?: string; title?: string }) =>
    requestJson<LearningSession>("/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listSessions: () => requestJson<LearningSession[]>("/sessions"),
  getSession: (sessionId: string) =>
    requestJson<{ session: LearningSession; messages: TutorMessage[] }>(`/sessions/${sessionId}`),
  endSession: (sessionId: string, explain?: ExplainLanguage) =>
    requestJson<{ session: LearningSession; review: SessionReview }>(`/sessions/${sessionId}/end`, {
      method: "POST",
      body: JSON.stringify({ ...(explain ? { explain } : {}) }),
    }),

  // Chat (Gemini AI Inner Council)
  sendChatMessage: (payload: {
    text: string;
    mode: LearnMode;
    explain?: ExplainLanguage;
    sessionId?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    idempotencyKey?: string;
  }) =>
    requestJson<TutorMessage>("/chat/message", {
      method: "POST",
      headers: payload.idempotencyKey ? { "Idempotency-Key": payload.idempotencyKey } : undefined,
      body: JSON.stringify({
        text: payload.text,
        mode: payload.mode,
        explain: payload.explain,
        ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
        ...(payload.history?.length ? { history: payload.history } : {}),
      }),
    }),

  // Tutor / Mentor continuous history helpers
  getTutorHistory: () => requestJson<TutorMessage[]>("/tutor/history"),
  clearTutorHistory: () => requestJson<{ ok: boolean }>("/tutor/history", { method: "DELETE" }),
  getMentorHistory: () => requestJson<TutorMessage[]>("/mentor/history"),
  clearMentorHistory: () => requestJson<{ ok: boolean }>("/mentor/history", { method: "DELETE" }),

  // Memory layers
  listConstantNotes: () => requestJson<ConstantNote[]>("/memory/notes"),
  addConstantNote: (payload: { title: string; content: string; tag: string; language?: string }) =>
    requestJson<ConstantNote>("/memory/notes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listMemoryCards: () => requestJson<MemoryCard[]>("/memory/cards"),
  createMemoryCard: () => requestJson<MemoryCard>("/memory/cards", { method: "POST" }),
  getLearnerModel: () => requestJson<LearnerConcept[]>("/learner-model"),

  // Mistakes & Fingerprint
  listMistakes: () => requestJson<MistakeRecord[]>("/mistakes"),
  listMistakePatterns: () => requestJson<MistakePattern[]>("/mistake-patterns"),

  // Adaptive Practice (Gemini AI + Learner Model update)
  generatePractice: (payload: {
    category: "grammar" | "vocab" | "speaking" | "writing";
    count: number;
    topic?: string;
    excludeQuestions?: string[];
  }) =>
    requestJson<{ questions: PracticeQuestion[]; generatedBy: string; generatedAt?: string }>(
      "/practice/generate",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  submitPracticeResults: (payload: { results: Array<{ concept: string; correct: boolean }> }) =>
    requestJson<{ updatedCount: number }>("/practice/submit", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Time Capsules
  listTimeCapsules: () => requestJson<TimeCapsuleItem[]>("/time-capsules"),
  createTimeCapsule: (payload: {
    content: string;
    daysFromNow?: number;
    targetLanguage?: string;
  }) =>
    requestJson<TimeCapsuleItem>("/time-capsules", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  openTimeCapsule: (id: string) =>
    requestJson<TimeCapsuleItem>(`/time-capsules/${id}/open`, { method: "PATCH" }),

  // Reports
  getWeeklyReport: () => requestJson<WeeklyReportPayload>("/reports/weekly"),

  // Voice AI (Gnani AI STT + TTS)
  getVoiceConfig: () => requestJson<VoiceConfig>("/voice/config"),
  transcribeVoice: async (
    audioBlob: Blob,
    language?: string,
  ): Promise<{ transcript: string; detectedLanguageCode: string; provider: string }> => {
    const mime = (audioBlob.type || "audio/wav").toLowerCase();
    const ext = mime.includes("wav")
      ? "wav"
      : mime.includes("ogg")
        ? "ogg"
        : mime.includes("mp4") || mime.includes("m4a")
          ? "m4a"
          : mime.includes("mpeg") || mime.includes("mp3")
            ? "mp3"
            : "webm";
    const form = new FormData();
    form.append("audio", audioBlob, `speech.${ext}`);
    if (language) form.append("language", language);
    return requestJson("/voice/transcribe", {
      method: "POST",
      body: form,
    });
  },
  synthesizeVoice: async (payload: {
    text: string;
    language?: string;
    voice?: string;
    speed?: number;
  }): Promise<Blob> => {
    const headers = await getAuthHeaders({ "Content-Type": "application/json" });
    const res = await fetch(`${API_BASE}/voice/synthesize`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal:
        typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
          ? AbortSignal.timeout(6500)
          : undefined,
    });
    if (!res.ok) {
      let msg = "Voice synthesis failed.";
      try {
        const err = (await res.json()) as { error?: { message?: string } };
        if (err.error?.message) msg = err.error.message;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    return res.blob();
  },

  // Exports & Privacy
  exportData: async (format: "json" | "markdown" | "html"): Promise<Blob> => {
    const headers = await getAuthHeaders({ "Content-Type": "application/json" });
    const res = await fetch(`${API_BASE}/exports`, {
      method: "POST",
      headers,
      body: JSON.stringify({ format }),
    });
    if (!res.ok) throw new Error("Failed to export learning data.");
    return res.blob();
  },
  deleteHistory: () => requestJson<{ deleted: boolean }>("/privacy/history", { method: "DELETE" }),
  deleteAccount: () =>
    requestJson<{ accountDeleted: boolean }>("/privacy/account", { method: "DELETE" }),
};
