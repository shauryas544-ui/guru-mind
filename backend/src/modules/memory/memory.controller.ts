import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { isMissingSchemaError } from "../../config/database";
import { requireAuthContext } from "../../middleware/authorize";
import { generateMemoryCardSnapshot } from "../../services/memory/memoryService";
import { scanAndSanitizeText } from "../../services/safety/safetyFilter";
import { ValidationError } from "../../utils/errors";

export const CreateNoteSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(1200),
  tag: z.string().trim().min(1).max(60).default("General"),
  language: z.string().trim().min(2).max(50).optional(),
});

export async function listConstantNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const { data, error } = await auth.supabase
      .from("constant_notes")
      .select("*")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(limit);

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

export async function addConstantNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const body = req.body as z.infer<typeof CreateNoteSchema>;

    const titleScan = scanAndSanitizeText(body.title);
    const contentScan = scanAndSanitizeText(body.content);
    if (titleScan.containsSensitiveData || contentScan.containsSensitiveData) {
      throw new ValidationError("Learning notes cannot contain passwords, IDs, or sensitive personal data.");
    }

    const { data: profile } = await auth.supabase
      .from("profiles")
      .select("learning_language")
      .eq("id", auth.userId)
      .maybeSingle();

    const { data, error } = await auth.supabase
      .from("constant_notes")
      .insert({
        user_id: auth.userId,
        language: body.language || profile?.learning_language || "English",
        tag: body.tag,
        title: titleScan.sanitizedText,
        content: contentScan.sanitizedText,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getLearnerModel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const { data, error } = await auth.supabase
      .from("learner_concepts")
      .select("*")
      .eq("user_id", auth.userId)
      .order("confidence", { ascending: true });

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

export async function listMemoryCards(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const { data, error } = await auth.supabase
      .from("memory_cards")
      .select("*")
      .eq("user_id", auth.userId)
      .order("version", { ascending: false })
      .limit(10);

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

export async function createMemoryCard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const { data: profile } = await auth.supabase
      .from("profiles")
      .select("learning_language")
      .eq("id", auth.userId)
      .maybeSingle();

    const card = await generateMemoryCardSnapshot(auth.supabase, {
      userId: auth.userId,
      language: profile?.learning_language || "English",
    });

    res.status(201).json({ success: true, data: card });
  } catch (err) {
    next(err);
  }
}

