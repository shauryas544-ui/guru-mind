import type { NextFunction, Request, Response } from "express";
import { isMissingSchemaError } from "../../config/database";
import { requireAuthContext } from "../../middleware/authorize";

export async function getTutorHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 200)));

    const { data, error } = await auth.supabase
      .from("messages")
      .select("id, session_id, role, content, mode, jo_sahi_tha, corrections, next_question, created_at")
      .eq("user_id", auth.userId)
      .neq("mode", "mentor")
      .order("created_at", { ascending: true })
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

export async function clearTutorHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const { error } = await auth.supabase
      .from("messages")
      .delete()
      .eq("user_id", auth.userId)
      .neq("mode", "mentor");

    if (error) {
      if (isMissingSchemaError(error)) {
        res.json({ success: true, data: { ok: true } });
        return;
      }
      throw new Error(error.message);
    }
    res.json({ success: true, data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

export async function getMentorHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 200)));

    const { data, error } = await auth.supabase
      .from("messages")
      .select("id, session_id, role, content, mode, jo_sahi_tha, corrections, next_question, created_at")
      .eq("user_id", auth.userId)
      .eq("mode", "mentor")
      .order("created_at", { ascending: true })
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

export async function clearMentorHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const { error } = await auth.supabase
      .from("messages")
      .delete()
      .eq("user_id", auth.userId)
      .eq("mode", "mentor");

    if (error) {
      if (isMissingSchemaError(error)) {
        res.json({ success: true, data: { ok: true } });
        return;
      }
      throw new Error(error.message);
    }
    res.json({ success: true, data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

