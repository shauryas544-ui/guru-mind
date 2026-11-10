import { api } from "@/services/api";
import type { Correction, ExplainLanguage, LearnMode, TutorMessage } from "@/types/api";

export type { Correction, TutorMessage };

export const getTutorHistory = () => api.getTutorHistory();
export const getMentorHistory = () => api.getMentorHistory();
export const clearTutorHistory = () => api.clearTutorHistory();
export const clearMentorHistory = () => api.clearMentorHistory();
export const listMistakes = () => api.listMistakes();

export const sendTutorMessage = ({
  data,
}: {
  data: {
    text: string;
    mode: LearnMode;
    explain?: ExplainLanguage;
    sessionId?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };
}) =>
  api.sendChatMessage({
    text: data.text,
    mode: data.mode,
    explain: data.explain,
    sessionId: data.sessionId,
    history: data.history,
    idempotencyKey:
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined,
  });
