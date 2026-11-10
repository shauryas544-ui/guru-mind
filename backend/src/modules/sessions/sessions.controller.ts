import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { isMissingSchemaError } from "../../config/database";
import { requireAuthContext } from "../../middleware/authorize";
import { generateEndOfSessionReview } from "../../services/ai/aiOrchestrator";
import { generateMemoryCardSnapshot } from "../../services/memory/memoryService";
import { isEducationalMemorySafe } from "../../services/safety/safetyFilter";
import { NotFoundError } from "../../utils/errors";
import type { ExplainLanguage, LearnMode, UserProfile } from "../../types";

export const CreateSessionSchema = z.object({
  mode: z.enum(["learn", "practice", "shadow", "test", "mentor"]).default("learn"),
  language: z.string().trim().min(2).max(50).optional(),
  title: z.string().trim().max(120).optional(),
});

export const EndSessionSchema = z.object({
  explain: z.enum(["Hinglish", "Hindi", "English"]).optional(),
});

export const SessionIdParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

export async function createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const body = req.body as z.infer<typeof CreateSessionSchema>;

    const { data: profile } = await auth.supabase
      .from("profiles")
      .select("learning_language")
      .eq("id", auth.userId)
      .maybeSingle();

    const language = body.language || profile?.learning_language || "English";
    const title = body.title || `${body.mode.charAt(0).toUpperCase() + body.mode.slice(1)} session`;

    const { data, error } = await auth.supabase
      .from("learning_sessions")
      .insert({
        user_id: auth.userId,
        mode: body.mode,
        language,
        title,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));

    const { data, error } = await auth.supabase
      .from("learning_sessions")
      .select("*")
      .eq("user_id", auth.userId)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      if (isMissingSchemaError(error)) {
        res.json({ success: true, data: [] });
        return;
      }
      throw new Error(error.message);
    }
    res.json({ success: true, data: data ?? [] });
  } catch (err) {
    next(err);
  }
}

export async function getSessionById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const { sessionId } = req.params;

    const [{ data: session, error: sErr }, { data: messages, error: mErr }] = await Promise.all([
      auth.supabase
        .from("learning_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("user_id", auth.userId)
        .maybeSingle(),
      auth.supabase
        .from("messages")
        .select("*")
        .eq("session_id", sessionId)
        .eq("user_id", auth.userId)
        .order("created_at", { ascending: true }),
    ]);

    if (sErr) throw new Error(sErr.message);
    if (mErr) throw new Error(mErr.message);
    if (!session) throw new NotFoundError("Learning session not found.");

    res.json({ success: true, data: { session, messages: messages ?? [] } });
  } catch (err) {
    next(err);
  }
}

export async function endSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const { sessionId } = req.params;
    const body = (req.body ?? {}) as z.infer<typeof EndSessionSchema>;

    const [{ data: session, error: sErr }, { data: profile }, { data: messages }, { data: mistakes }] =
      await Promise.all([
        auth.supabase
          .from("learning_sessions")
          .select("*")
          .eq("id", sessionId)
          .eq("user_id", auth.userId)
          .maybeSingle(),
        auth.supabase.from("profiles").select("*").eq("id", auth.userId).maybeSingle(),
        auth.supabase
          .from("messages")
          .select("role, content")
          .eq("session_id", sessionId)
          .eq("user_id", auth.userId)
          .order("created_at", { ascending: true })
          .limit(30),
        auth.supabase
          .from("mistakes")
          .select("original_text, corrected_text, concept, root_cause")
          .eq("session_id", sessionId)
          .eq("user_id", auth.userId)
          .limit(20),
      ]);

    if (sErr) throw new Error(sErr.message);
    if (!session) throw new NotFoundError("Learning session not found.");

    const explainLanguage = (body.explain ?? profile?.explain_language ?? "Hinglish") as ExplainLanguage;
    const review = await generateEndOfSessionReview({
      profile: (profile ?? {}) as Partial<UserProfile>,
      mode: session.mode as LearnMode,
      explainLanguage,
      messages: (messages ?? []) as Array<{ role: string; content: string }>,
      mistakes: (mistakes ?? []) as Array<{
        original_text: string;
        corrected_text: string;
        concept: string;
        root_cause: string;
      }>,
    });

    const endedAt = new Date().toISOString();
    const { data: updated, error: uErr } = await auth.supabase
      .from("learning_sessions")
      .update({
        ended_at: endedAt,
        summary: review.summary,
        homework: review.homework,
        next_guidance: review.nextSessionGuidance,
      })
      .eq("id", sessionId)
      .eq("user_id", auth.userId)
      .select("*")
      .single();

    if (uErr) throw new Error(uErr.message);

    // Save session report
    await auth.supabase.from("reports").insert({
      user_id: auth.userId,
      report_type: "session",
      period_start: session.started_at,
      period_end: endedAt,
      summary: review,
    });

    // Save constant note takeaway if safe
    if (
      review.constantNote &&
      isEducationalMemorySafe(review.constantNote.title) &&
      isEducationalMemorySafe(review.constantNote.content)
    ) {
      await auth.supabase.from("constant_notes").insert({
        user_id: auth.userId,
        language: session.language,
        tag: review.constantNote.tag,
        title: review.constantNote.title,
        content: review.constantNote.content,
        source_session_id: session.id,
      });
    }

    // Refresh compact memory card snapshot asynchronously
    await generateMemoryCardSnapshot(auth.supabase, {
      userId: auth.userId,
      language: session.language,
    }).catch(() => undefined);

    res.json({ success: true, data: { session: updated, review } });
  } catch (err) {
    next(err);
  }
}

export async function deleteSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const { sessionId } = req.params;

    const { error } = await auth.supabase
      .from("learning_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", auth.userId);

    if (error) throw new Error(error.message);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

