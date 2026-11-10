import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuthContext } from "../../middleware/authorize";
import {
  getGnaniVoiceCatalog,
  synthesizeWithGnani,
  transcribeWithGnani,
  warmGnaniConnection,
} from "../../services/ai/gnaniProvider";
import { ValidationError } from "../../utils/errors";

export const audioUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("audio/") && file.mimetype !== "application/octet-stream") {
      cb(new ValidationError("Only audio files are supported for voice transcription."));
      return;
    }
    cb(null, true);
  },
}).single("audio");

export const SynthesizeVoiceSchema = z.object({
  text: z.string().trim().min(1).max(1200),
  language: z.string().trim().min(2).max(30).optional(),
  voice: z.string().trim().min(2).max(50).optional(),
  speed: z.number().min(0.6).max(1.5).optional(),
});

export function getVoiceConfig(_req: Request, res: Response): void {
  void warmGnaniConnection();
  res.json({
    success: true,
    data: getGnaniVoiceCatalog(),
  });
}

export async function transcribeVoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireAuthContext(req);
    const file = req.file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new ValidationError("Missing audio file in multipart field 'audio'.");
    }

    const languageCode = typeof req.body?.language === "string" ? req.body.language : undefined;
    const result = await transcribeWithGnani({
      audioBuffer: file.buffer,
      filename: file.originalname || "speech.webm",
      mimeType: file.mimetype || "audio/webm",
      languageCode,
    });

    res.json({
      success: true,
      data: {
        ...result,
        provider: "gnani",
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function synthesizeVoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const body = req.body as z.infer<typeof SynthesizeVoiceSchema>;

    let voice = body.voice;
    let language = body.language;
    if (!voice || !language) {
      const { data: profile } = await auth.supabase
        .from("profiles")
        .select("voice_preference, learning_language")
        .eq("id", auth.userId)
        .maybeSingle();
      if (!voice && profile?.voice_preference) voice = profile.voice_preference;
      if (!language && profile?.learning_language) language = profile.learning_language;
    }

    const audio = await synthesizeWithGnani({
      text: body.text,
      voice,
      language,
      speed: body.speed,
    });

    res.setHeader("Content-Type", audio.contentType);
    res.setHeader("X-Voice-Provider", "gnani");
    res.setHeader("X-Voice-Model", audio.model);
    res.setHeader("X-Voice-Name", audio.voice);
    res.send(audio.audioBuffer);
  } catch (err) {
    next(err);
  }
}

