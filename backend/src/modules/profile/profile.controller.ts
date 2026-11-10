import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { isMissingSchemaError } from "../../config/database";
import { requireAuthContext } from "../../middleware/authorize";
import { scanAndSanitizeText } from "../../services/safety/safetyFilter";
import { NotFoundError } from "../../utils/errors";

let cachedMigrationSql: string | null = null;

function loadInitialSchemaSql(): string {
  if (cachedMigrationSql !== null) return cachedMigrationSql;
  const candidates = [
    path.resolve(process.cwd(), "database/migrations/0001_initial_schema.sql"),
    path.resolve(process.cwd(), "../database/migrations/0001_initial_schema.sql"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      cachedMigrationSql = fs.readFileSync(filePath, "utf8");
      return cachedMigrationSql;
    }
  }
  throw new NotFoundError("Migration file database/migrations/0001_initial_schema.sql not found.");
}

export const UpdateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  native_language: z.string().trim().min(2).max(50).optional(),
  learning_language: z.string().trim().min(2).max(50).optional(),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).optional(),
  goal: z.string().trim().max(400).optional(),
  explain_language: z.enum(["Hinglish", "Hindi", "English"]).optional(),
  voice_preference: z.string().trim().min(2).max(60).optional(),
  save_history: z.boolean().optional(),
});

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const buildFallbackProfile = () => {
      const now = new Date().toISOString();
      return {
        id: auth.userId,
        email: auth.email,
        full_name: auth.email.split("@")[0] || "Learner",
        native_language: "Hindi",
        learning_language: "English",
        level: "Beginner",
        goal: "",
        explain_language: "Hinglish",
        voice_preference: "Shivani",
        save_history: true,
        created_at: now,
        updated_at: now,
      };
    };

    const { data, error } = await auth.supabase
      .from("profiles")
      .select("*")
      .eq("id", auth.userId)
      .maybeSingle();

    if (error) {
      if (isMissingSchemaError(error)) {
        res.json({ success: true, data: buildFallbackProfile() });
        return;
      }
      throw new Error(error.message);
    }

    // Ensure profile exists even if trigger didn't run on older auth accounts
    if (!data) {
      const { data: created, error: insErr } = await auth.supabase
        .from("profiles")
        .insert({
          id: auth.userId,
          full_name: auth.email.split("@")[0] || "Learner",
        })
        .select("*")
        .single();
      if (insErr) {
        if (isMissingSchemaError(insErr)) {
          res.json({ success: true, data: buildFallbackProfile() });
          return;
        }
        throw new Error(insErr.message);
      }
      res.json({ success: true, data: { ...created, email: auth.email } });
      return;
    }

    res.json({ success: true, data: { ...data, email: auth.email } });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const body = req.body as z.infer<typeof UpdateProfileSchema>;

    const updates: Record<string, unknown> = {};
    if (body.full_name !== undefined) updates.full_name = scanAndSanitizeText(body.full_name).sanitizedText;
    if (body.native_language !== undefined) updates.native_language = body.native_language;
    if (body.learning_language !== undefined) updates.learning_language = body.learning_language;
    if (body.level !== undefined) updates.level = body.level;
    if (body.goal !== undefined) updates.goal = scanAndSanitizeText(body.goal).sanitizedText;
    if (body.explain_language !== undefined) updates.explain_language = body.explain_language;
    if (body.voice_preference !== undefined) updates.voice_preference = body.voice_preference;
    if (body.save_history !== undefined) updates.save_history = body.save_history;

    const { data, error } = await auth.supabase
      .from("profiles")
      .update(updates)
      .eq("id", auth.userId)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundError("Profile not found.");

    res.json({ success: true, data: { ...data, email: auth.email } });
  } catch (err) {
    next(err);
  }
}

export function getSchemaSql(req: Request, res: Response, next: NextFunction): void {
  try {
    requireAuthContext(req);
    const sql = loadInitialSchemaSql();
    res.json({
      success: true,
      data: {
        filename: "database/migrations/0001_initial_schema.sql",
        sql,
      },
    });
  } catch (err) {
    next(err);
  }
}

