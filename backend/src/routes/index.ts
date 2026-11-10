import { Router } from "express";
import { isSupabaseBackendConfigured } from "../config/database";
import { env } from "../config/environment";
import { createAuthenticateMiddleware, type TokenVerifier } from "../middleware/authenticate";
import { rejectUserSpoofing } from "../middleware/authorize";
import { aiRateLimiter, generalRateLimiter } from "../middleware/rateLimiter";
import { validateRequest } from "../middleware/validateRequest";
import { isGeminiConfigured } from "../services/ai/geminiProvider";
import { isGnaniConfigured } from "../services/ai/gnaniProvider";
import { ChatMessageSchema, postChatMessage } from "../modules/chat/chat.controller";
import {
  deleteLearningHistory,
  deleteUserAccount,
  RequestExportSchema,
  requestExport,
} from "../modules/exports/exports.controller";
import {
  addConstantNote,
  createMemoryCard,
  CreateNoteSchema,
  getLearnerModel,
  listConstantNotes,
  listMemoryCards,
} from "../modules/memory/memory.controller";
import { listMistakePatterns, listMistakes } from "../modules/mistakes/mistakes.controller";
import {
  generatePractice,
  GeneratePracticeSchema,
  submitPractice,
  SubmitPracticeSchema,
} from "../modules/practice/practice.controller";
import { getProfile, getSchemaSql, updateProfile, UpdateProfileSchema } from "../modules/profile/profile.controller";
import { getWeeklyReport } from "../modules/reports/reports.controller";
import {
  createSession,
  CreateSessionSchema,
  deleteSession,
  endSession,
  EndSessionSchema,
  getSessionById,
  listSessions,
  SessionIdParamsSchema,
} from "../modules/sessions/sessions.controller";
import {
  CapsuleIdParamsSchema,
  CreateCapsuleSchema,
  createTimeCapsule,
  listTimeCapsules,
  openTimeCapsule,
} from "../modules/timeCapsules/timeCapsules.controller";
import {
  clearMentorHistory,
  clearTutorHistory,
  getMentorHistory,
  getTutorHistory,
} from "../modules/tutor/tutor.controller";
import {
  audioUploadMiddleware,
  getVoiceConfig,
  synthesizeVoice,
  SynthesizeVoiceSchema,
  transcribeVoice,
} from "../modules/voice/voice.controller";

export function createApiRouter(options: { tokenVerifier?: TokenVerifier } = {}): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(options.tokenVerifier);

  // Public health check (never exposes credentials)
  router.get("/health", (_req, res) => {
    res.json({
      success: true,
      data: {
        status: "ok",
        service: "guru-mind-api",
        timestamp: new Date().toISOString(),
        providers: {
          geminiConfigured: isGeminiConfigured(),
          geminiModel: env.geminiModel,
          gnaniConfigured: isGnaniConfigured(),
          gnaniSttModel: env.gnaniSttModel,
          gnaniTtsModel: env.gnaniTtsModel,
          supabaseConfigured: isSupabaseBackendConfigured(),
        },
      },
    });
  });

  // Protected API routes (all require verified Supabase Bearer token)
  router.use(authenticate);
  router.use(rejectUserSpoofing);
  router.use(generalRateLimiter);

  // Profile
  router.get("/profile", getProfile);
  router.patch("/profile", validateRequest({ body: UpdateProfileSchema }), updateProfile);
  router.get("/profile/schema-sql", getSchemaSql);

  // Learning Sessions
  router.post("/sessions", validateRequest({ body: CreateSessionSchema }), createSession);
  router.get("/sessions", listSessions);
  router.get("/sessions/:sessionId", validateRequest({ params: SessionIdParamsSchema }), getSessionById);
  router.post(
    "/sessions/:sessionId/end",
    aiRateLimiter,
    validateRequest({ params: SessionIdParamsSchema, body: EndSessionSchema }),
    endSession,
  );
  router.delete("/sessions/:sessionId", validateRequest({ params: SessionIdParamsSchema }), deleteSession);

  // AI Chat (Gemini Inner Council)
  router.post("/chat/message", aiRateLimiter, validateRequest({ body: ChatMessageSchema }), postChatMessage);

  // Continuous Tutor / Mentor History helpers
  router.get("/tutor/history", getTutorHistory);
  router.delete("/tutor/history", clearTutorHistory);
  router.get("/mentor/history", getMentorHistory);
  router.delete("/mentor/history", clearMentorHistory);

  // Memory Layers (Constant Notes, Learner Model, Memory Cards)
  router.get("/memory/notes", listConstantNotes);
  router.post("/memory/notes", validateRequest({ body: CreateNoteSchema }), addConstantNote);
  router.get("/memory/cards", listMemoryCards);
  router.post("/memory/cards", createMemoryCard);
  router.get("/learner-model", getLearnerModel);

  // Mistakes & Mistake Fingerprint
  router.get("/mistakes", listMistakes);
  router.get("/mistake-patterns", listMistakePatterns);

  // Adaptive Practice (Gemini AI + Learner Model update loop)
  router.post("/practice/generate", aiRateLimiter, validateRequest({ body: GeneratePracticeSchema }), generatePractice);
  router.post("/practice/submit", validateRequest({ body: SubmitPracticeSchema }), submitPractice);

  // Time Capsules
  router.get("/time-capsules", listTimeCapsules);
  router.post("/time-capsules", validateRequest({ body: CreateCapsuleSchema }), createTimeCapsule);
  router.patch("/time-capsules/:id/open", validateRequest({ params: CapsuleIdParamsSchema }), openTimeCapsule);

  // Reports
  router.get("/reports/weekly", getWeeklyReport);

  // Voice AI (Gnani AI — STT Prisma & TTS Timbre)
  router.get("/voice/config", getVoiceConfig);
  router.post("/voice/transcribe", aiRateLimiter, audioUploadMiddleware, transcribeVoice);
  router.post("/voice/synthesize", aiRateLimiter, validateRequest({ body: SynthesizeVoiceSchema }), synthesizeVoice);

  // Exports & Privacy Controls
  router.post("/exports", validateRequest({ body: RequestExportSchema }), requestExport);
  router.delete("/privacy/history", deleteLearningHistory);
  router.delete("/privacy/account", deleteUserAccount);

  return router;
}

