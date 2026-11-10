import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  clearMissingSchemaCache,
  isMissingSchemaCached,
  isMissingSchemaError,
  markSchemaMissing,
} from "../../config/database";
import { requireAuthContext } from "../../middleware/authorize";
import { orchestrateChatTurn } from "../../services/ai/aiOrchestrator";
import {
  persistValidatedMemoryUpdates,
  retrievePromptMemory,
} from "../../services/memory/memoryService";
import type { PromptMemoryContext } from "../../services/prompts/promptBuilder";
import { scanAndSanitizeText } from "../../services/safety/safetyFilter";
import { logger } from "../../utils/logger";
import { chatIdempotencyStore } from "../../utils/retry";
import type { ExplainLanguage, LearnMode, UserProfile } from "../../types";

export const ChatMessageSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  mode: z.enum(["learn", "practice", "shadow", "test", "mentor"]).default("learn"),
  explain: z.enum(["Hinglish", "Hindi", "English"]).optional(),
  sessionId: z.string().uuid().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .max(14)
    .optional(),
});

/**
 * Implements the 12-step Architecture Section 7.2 chat request lifecycle:
 * Auth -> Validate -> Safety/Privacy -> Active Session -> Memory Retrieval -> Prompt ->
 * Gemini AI Inner Council -> Output Verification -> Conditional Save -> Memory Extraction & Update -> Return.
 */
export async function postChatMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const body = req.body as z.infer<typeof ChatMessageSchema>;

    // Optional idempotency protection for network retries
    const idempotencyKey = req.header("idempotency-key")?.trim();
    const cacheKey = idempotencyKey ? `${auth.userId}:${idempotencyKey}` : null;
    if (cacheKey) {
      const cached = chatIdempotencyStore.get<unknown>(cacheKey);
      if (cached) {
        res.json({ success: true, data: cached });
        return;
      }
    }

    // Step 3: Safety & privacy check
    const safety = scanAndSanitizeText(body.text);
    const cleanLearnerText = safety.sanitizedText;

    // Load user profile and optional existing session in parallel; degrade gracefully if schema isn't created yet
    let dbAvailable = !isMissingSchemaCached();
    let profile: Record<string, unknown> | null = null;
    let ownedSessionRes: { data: { id: string } | null; error: unknown } = { data: null, error: null };

    if (dbAvailable) {
      const [profileRes, ownedRes] = await Promise.all([
        auth.supabase.from("profiles").select("*").eq("id", auth.userId).maybeSingle(),
        body.sessionId
          ? auth.supabase
              .from("learning_sessions")
              .select("id")
              .eq("id", body.sessionId)
              .eq("user_id", auth.userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      profile = profileRes.data as Record<string, unknown> | null;
      ownedSessionRes = ownedRes;
      const profileErr = profileRes.error;

      if (profileErr && isMissingSchemaError(profileErr)) {
        dbAvailable = false;
        markSchemaMissing();
      } else if (profileErr) {
        throw new Error(profileErr.message);
      } else {
        clearMissingSchemaCache();
        if (!profile) {
          const { data: createdProfile, error: insProfileErr } = await auth.supabase
            .from("profiles")
            .insert({ id: auth.userId, full_name: auth.email.split("@")[0] || "Learner" })
            .select("*")
            .single();
          if (insProfileErr && isMissingSchemaError(insProfileErr)) {
            dbAvailable = false;
            markSchemaMissing();
          } else {
            profile = createdProfile as Record<string, unknown> | null;
          }
        }
      }
    }

    const typedProfile = (profile ?? {
      full_name: auth.email.split("@")[0] || "Learner",
    }) as Partial<UserProfile>;
    const targetLanguage = typedProfile.learning_language || "English";
    const explainLanguage = (body.explain ?? typedProfile.explain_language ?? "Hinglish") as ExplainLanguage;
    const saveHistory = dbAvailable ? (typedProfile.save_history ?? true) : false;
    const mode = body.mode as LearnMode;

    // Step 4: Resolve active session or auto-create/reuse open session for mode
    let sessionId: string | undefined = dbAvailable ? body.sessionId : undefined;
    if (dbAvailable && sessionId) {
      if (ownedSessionRes.error && isMissingSchemaError(ownedSessionRes.error)) {
        dbAvailable = false;
        sessionId = undefined;
      } else if (!ownedSessionRes.data) {
        sessionId = undefined;
      }
    }

    if (dbAvailable && !sessionId) {
      let sessionQuery = auth.supabase
        .from("learning_sessions")
        .select("id")
        .eq("user_id", auth.userId)
        .is("ended_at", null);

      sessionQuery = mode === "mentor" ? sessionQuery.eq("mode", "mentor") : sessionQuery.neq("mode", "mentor");

      const { data: openSession, error: openSessErr } = await sessionQuery
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openSessErr && isMissingSchemaError(openSessErr)) {
        dbAvailable = false;
        markSchemaMissing();
      } else if (openSession?.id) {
        sessionId = openSession.id;
      } else {
        const { data: createdSession, error: sessErr } = await auth.supabase
          .from("learning_sessions")
          .insert({
            user_id: auth.userId,
            mode,
            language: targetLanguage,
            title: mode === "mentor" ? "Mentor conversation" : "Tutor session",
          })
          .select("id")
          .single();
        if (sessErr && isMissingSchemaError(sessErr)) {
          dbAvailable = false;
          markSchemaMissing();
        } else if (sessErr) {
          throw new Error(sessErr.message);
        } else {
          sessionId = createdSession.id;
        }
      }
    }

    if (!dbAvailable) {
      logger.warn("Database tables missing in Supabase schema cache — serving stateless live response", {
        userId: auth.userId,
        mode,
      });
    }

    // Step 5: Retrieve bounded relevant memory across layers
    const memoryContext: PromptMemoryContext =
      dbAvailable && sessionId
        ? await retrievePromptMemory(auth.supabase, {
            userId: auth.userId,
            sessionId,
            language: targetLanguage,
            mode,
          })
        : {
            weakConcepts: [],
            topMistakePatterns: [],
            relevantNotes: [],
            recentMessages: [],
          };

    if (memoryContext.recentMessages.length === 0 && body.history?.length) {
      memoryContext.recentMessages = body.history.map((item) => ({
        role: item.role,
        content: scanAndSanitizeText(item.content).sanitizedText,
      }));
    }

    // Step 6-9a: Persist learner message IN PARALLEL with calling Gemini Inner Council
    const userMsgPromise =
      dbAvailable && saveHistory && sessionId
        ? auth.supabase.from("messages").insert({
            session_id: sessionId,
            user_id: auth.userId,
            role: "user",
            content: cleanLearnerText,
            mode,
          })
        : Promise.resolve({ error: null });

    const [userMsgRes, councilResult] = await Promise.all([
      userMsgPromise,
      orchestrateChatTurn({
        profile: typedProfile,
        mode,
        explainLanguage,
        learnerMessage: cleanLearnerText,
        memory: memoryContext,
      }),
    ]);

    if (userMsgRes.error) {
      if (isMissingSchemaError(userMsgRes.error)) {
        dbAvailable = false;
      } else {
        throw new Error(userMsgRes.error.message);
      }
    }

    // Step 9b: Save assistant message
    let savedAssistantMsg: Record<string, unknown> = {
      id: `ephemeral-${Date.now()}`,
      ...(sessionId ? { session_id: sessionId } : {}),
      role: "assistant",
      content: councilResult.reply,
      mode,
      jo_sahi_tha: councilResult.joSahiTha,
      corrections: councilResult.corrections,
      next_question: councilResult.nextQuestion,
      created_at: new Date().toISOString(),
    };

    if (dbAvailable && saveHistory && sessionId) {
      const { data: insertedMsg, error: asstErr } = await auth.supabase
        .from("messages")
        .insert({
          session_id: sessionId,
          user_id: auth.userId,
          role: "assistant",
          content: councilResult.reply,
          mode,
          jo_sahi_tha: councilResult.joSahiTha,
          corrections: councilResult.corrections,
          next_question: councilResult.nextQuestion,
        })
        .select("id, session_id, role, content, mode, jo_sahi_tha, corrections, next_question, created_at")
        .single();
      if (asstErr) throw new Error(asstErr.message);
      savedAssistantMsg = insertedMsg;
    }

    // Step 10-11: Validate and persist approved memory updates (parallelized inside memoryService)
    if (dbAvailable && saveHistory && sessionId) {
      await persistValidatedMemoryUpdates(auth.supabase, {
        userId: auth.userId,
        sessionId,
        messageId:
          typeof savedAssistantMsg.id === "string" && !savedAssistantMsg.id.startsWith("ephemeral-")
            ? savedAssistantMsg.id
            : undefined,
        language: targetLanguage,
        corrections: councilResult.corrections,
        memoryCandidates: councilResult.memoryCandidates,
        constantNoteCandidate: councilResult.constantNoteCandidate,
        saveHistory,
      });
    }

    const responsePayload = {
      ...savedAssistantMsg,
      ...(sessionId ? { sessionId } : {}),
      joSahiTha: councilResult.joSahiTha,
      nextQuestion: councilResult.nextQuestion,
      privacyWarning: safety.containsSensitiveData
        ? "Sensitive personal details were redacted before saving."
        : undefined,
      persistenceWarning: !dbAvailable
        ? "Database tables are not set up yet — run database/migrations/0001_initial_schema.sql in your Supabase SQL Editor to save conversations and memory."
        : undefined,
    };

    if (cacheKey) {
      chatIdempotencyStore.set(cacheKey, responsePayload);
    }

    res.json({ success: true, data: responsePayload });
  } catch (err) {
    next(err);
  }
}
