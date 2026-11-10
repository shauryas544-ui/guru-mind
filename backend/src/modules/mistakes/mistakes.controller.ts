import type { NextFunction, Request, Response } from "express";
import { isMissingSchemaError } from "../../config/database";
import { requireAuthContext } from "../../middleware/authorize";

export async function listMistakes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100)));

    const { data, error } = await auth.supabase
      .from("mistakes")
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

    // Normalize field aliases for smooth frontend compatibility
    const normalized = (data ?? []).map((row) => ({
      ...row,
      original: row.original_text,
      corrected: row.corrected_text,
    }));

    res.json({ success: true, data: normalized });
  } catch (err) {
    next(err);
  }
}

export async function listMistakePatterns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const { data, error } = await auth.supabase
      .from("mistake_patterns")
      .select("*")
      .eq("user_id", auth.userId)
      .order("occurrence_count", { ascending: false })
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

