import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { isMissingSchemaError } from "../../config/database";
import { requireAuthContext } from "../../middleware/authorize";
import { scanAndSanitizeText } from "../../services/safety/safetyFilter";
import { NotFoundError, ValidationError } from "../../utils/errors";

export const CreateCapsuleSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  daysFromNow: z.number().int().min(1).max(365).default(30),
  targetLanguage: z.string().trim().min(2).max(50).optional(),
});

export const CapsuleIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function listTimeCapsules(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const { data, error } = await auth.supabase
      .from("time_capsules")
      .select("*")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(50);

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

export async function createTimeCapsule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const body = req.body as z.infer<typeof CreateCapsuleSchema>;

    const scan = scanAndSanitizeText(body.content);
    if (scan.containsSensitiveData) {
      throw new ValidationError("Time capsules cannot store sensitive secrets or government IDs.");
    }

    const { data: profile } = await auth.supabase
      .from("profiles")
      .select("learning_language")
      .eq("id", auth.userId)
      .maybeSingle();

    const reminderAt = new Date(Date.now() + body.daysFromNow * 86_400_000).toISOString();
    const { data, error } = await auth.supabase
      .from("time_capsules")
      .insert({
        user_id: auth.userId,
        content: scan.sanitizedText,
        target_language: body.targetLanguage || profile?.learning_language || "English",
        reminder_at: reminderAt,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function openTimeCapsule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const { id } = req.params;

    const { data: capsule, error: fetchErr } = await auth.supabase
      .from("time_capsules")
      .select("*")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!capsule) throw new NotFoundError("Time capsule not found.");

    if (new Date(capsule.reminder_at) > new Date()) {
      throw new ValidationError("This time capsule is still sealed until its reminder date.");
    }

    const { data, error } = await auth.supabase
      .from("time_capsules")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", auth.userId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

