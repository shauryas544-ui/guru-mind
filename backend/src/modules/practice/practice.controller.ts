import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { isMissingSchemaError } from "../../config/database";
import { requireAuthContext } from "../../middleware/authorize";
import { generateAdaptivePracticeQuestions } from "../../services/ai/aiOrchestrator";
import { recordPracticeOutcomes } from "../../services/memory/memoryService";
import type { UserProfile } from "../../types";

export const GeneratePracticeSchema = z.object({
  category: z.enum(["grammar", "vocab", "speaking", "writing"]).default("grammar"),
  count: z.number().int().min(1).max(10).default(5),
  topic: z.string().trim().max(120).optional(),
  excludeQuestions: z.array(z.string().trim().max(300)).max(25).optional(),
});

export const SubmitPracticeSchema = z.object({
  results: z
    .array(
      z.object({
        concept: z.string().trim().min(1).max(100),
        correct: z.boolean(),
      }),
    )
    .min(1)
    .max(20),
});

export async function generatePractice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const body = req.body as z.infer<typeof GeneratePracticeSchema>;

    const [{ data: profile }, { data: concepts }, { data: patterns }] = await Promise.all([
      auth.supabase.from("profiles").select("*").eq("id", auth.userId).maybeSingle(),
      auth.supabase
        .from("learner_concepts")
        .select("concept, error_count")
        .eq("user_id", auth.userId)
        .order("confidence", { ascending: true })
        .limit(5),
      auth.supabase
        .from("mistake_patterns")
        .select("pattern_key, root_cause")
        .eq("user_id", auth.userId)
        .order("occurrence_count", { ascending: false })
        .limit(4),
    ]);

    const questions = await generateAdaptivePracticeQuestions({
      profile: (profile ?? {}) as Partial<UserProfile>,
      category: body.category,
      count: body.count,
      weakConcepts: (concepts ?? []) as Array<{ concept: string; error_count: number }>,
      patterns: (patterns ?? []) as Array<{ pattern_key: string; root_cause: string }>,
      topic: body.topic,
      excludeQuestions: body.excludeQuestions,
    });

    res.json({
      success: true,
      data: {
        questions,
        generatedBy: "gemini",
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function submitPractice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const body = req.body as z.infer<typeof SubmitPracticeSchema>;

    const { data: profile, error: profileErr } = await auth.supabase
      .from("profiles")
      .select("learning_language")
      .eq("id", auth.userId)
      .maybeSingle();

    if (profileErr && isMissingSchemaError(profileErr)) {
      res.json({ success: true, data: { updatedCount: 0 } });
      return;
    }

    const language = profile?.learning_language || "English";
    const outcome = await recordPracticeOutcomes(auth.supabase, {
      userId: auth.userId,
      language,
      results: body.results,
    });

    res.json({ success: true, data: outcome });
  } catch (err) {
    if (isMissingSchemaError(err)) {
      res.json({ success: true, data: { updatedCount: 0 } });
      return;
    }
    next(err);
  }
}
