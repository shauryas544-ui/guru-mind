import dns from "node:dns";
import { env } from "../../config/environment";
import { ExternalServiceError, RateLimitError, ServiceUnavailableError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { isTransientError, withRetry, withTimeout } from "../../utils/retry";
import type { GnaniSttResult, GnaniTtsResult } from "../../types";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

let lastGnaniWarmAt = 0;

/**
 * Non-blocking TLS/DNS keep-alive warm-up so first voice turn doesn't pay cold handshake cost.
 */
export async function warmGnaniConnection(): Promise<void> {
  if (env.nodeEnv === "test" || !isGnaniConfigured()) return;
  const now = Date.now();
  if (now - lastGnaniWarmAt < 20_000) return;
  lastGnaniWarmAt = now;

  try {
    await fetch(env.gnaniBaseUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // Ignore warm-up failures; actual voice calls handle errors cleanly
  }
}

export const GNANI_TIMBRE_V3_VOICES = [
  { id: "Shivani", label: "Shivani (Warm, Clear)", gender: "Female" },
  { id: "Devansh", label: "Devansh (Calm, Friendly)", gender: "Male" },
  { id: "Riyaa", label: "Riyaa (Energetic, Conversational)", gender: "Female" },
  { id: "Prakash", label: "Prakash (Steady Mentor)", gender: "Male" },
  { id: "Lakshmi", label: "Lakshmi (Patient Teacher)", gender: "Female" },
  { id: "Avinash", label: "Avinash (Natural)", gender: "Male" },
  { id: "Kalpana", label: "Kalpana (Gentle)", gender: "Female" },
  { id: "Shubham", label: "Shubham (Youthful)", gender: "Male" },
  { id: "Yashraj", label: "Yashraj (Confident)", gender: "Male" },
  { id: "Chetana", label: "Chetana (Expressive)", gender: "Female" },
  { id: "Vasudha", label: "Vasudha (Classic)", gender: "Female" },
  { id: "Kavitha", label: "Kavitha (Crisp)", gender: "Female" },
  { id: "Tarika", label: "Tarika (Bright)", gender: "Female" },
] as const;

export const GNANI_LANGUAGE_MAP: Record<string, string> = {
  English: "en-IN",
  Hindi: "hi-IN",
  Hinglish: "indic-auto",
  Tamil: "ta-IN",
  Telugu: "te-IN",
  Kannada: "kn-IN",
  Malayalam: "ml-IN",
  Marathi: "mr-IN",
  Bengali: "bn-IN",
  Gujarati: "gu-IN",
  Punjabi: "pa-IN",
};

function hasUsableKey(val: string | undefined): boolean {
  const trimmed = val?.trim() ?? "";
  return trimmed.length > 0 && !trimmed.startsWith("your-");
}

export function isGnaniConfigured(): boolean {
  return hasUsableKey(env.gnaniApiKey);
}

function assertGnaniKey(): string {
  if (!hasUsableKey(env.gnaniApiKey)) {
    throw new ServiceUnavailableError(
      "Gnani AI Voice is not configured. Set GNANI_API_KEY in your .env file.",
    );
  }
  return env.gnaniApiKey.trim();
}

export function resolveGnaniLanguageCode(language?: string): string {
  if (!language) return "indic-auto";
  if (/^[a-z]{2}-[A-Z]{2}$/.test(language) || language === "indic-auto" || language === "indic") {
    return language;
  }
  return GNANI_LANGUAGE_MAP[language] ?? "en-IN";
}

export interface GnaniTranscribeInput {
  audioBuffer: Buffer;
  filename: string;
  mimeType: string;
  languageCode?: string;
  model?: string;
}

/**
 * Transcribes spoken audio using Gnani Vachana Prisma STT (POST /stt/v3).
 */
export async function transcribeWithGnani(input: GnaniTranscribeInput): Promise<GnaniSttResult> {
  const apiKey = assertGnaniKey();
  if (!input.audioBuffer || input.audioBuffer.length === 0) {
    throw new ValidationError("Audio file is empty.");
  }

  const endpoint = `${env.gnaniBaseUrl}/stt/v3`;
  const model = input.model || env.gnaniSttModel;
  const languageCode = resolveGnaniLanguageCode(input.languageCode);

  return withRetry(
    async () => {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(input.audioBuffer)], {
        type: input.mimeType || "audio/webm",
      });
      form.append("audio_file", blob, input.filename || "recording.webm");
      form.append("model", model);
      form.append("language_code", languageCode);
      form.append("format", "transcribe");

      const sttTimeoutMs = Math.min(Math.max(env.aiTimeoutMs, 8000), 10_000);
      const res = await withTimeout(
        fetch(endpoint, {
          method: "POST",
          headers: {
            "X-API-Key-ID": apiKey,
          },
          body: form,
          signal: AbortSignal.timeout(sttTimeoutMs),
        }),
        sttTimeoutMs + 200,
        "Gnani STT",
      );

      if (res.status === 429) {
        throw new RateLimitError("Gnani voice recognition is busy. Please try again in a second.");
      }
      if (res.status === 401 || res.status === 403) {
        throw new ExternalServiceError("Gnani API key is invalid or unauthorized.", 502, "GNANI_AUTH_ERROR");
      }
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        logger.warn("Gnani STT non-OK status", { status: res.status, bodyPreview: errBody.slice(0, 200) });
        throw new ExternalServiceError("Gnani Speech-to-Text could not transcribe the audio.", 502, "GNANI_STT_ERROR");
      }

      const payload = (await res.json()) as {
        success?: boolean;
        transcript?: string;
        model?: string;
        detected_language_code?: string;
        processing_time?: number;
        end_to_end_latency?: number;
      };

      return {
        transcript: (payload.transcript ?? "").trim(),
        detectedLanguageCode: payload.detected_language_code ?? languageCode,
        model: payload.model ?? model,
        processingTime: payload.processing_time ?? 0,
        latency: payload.end_to_end_latency ?? 0,
      };
    },
    { maxAttempts: 2, baseDelayMs: 150 },
  );
}

export interface GnaniSynthesizeInput {
  text: string;
  voice?: string;
  language?: string;
  model?: string;
  speed?: number;
}

/**
 * Converts text into natural Indian-accent speech using Gnani Timbre TTS (POST /api/v1/tts/inference).
 */
export async function synthesizeWithGnani(input: GnaniSynthesizeInput): Promise<GnaniTtsResult> {
  const apiKey = assertGnaniKey();
  const cleanText = input.text.replace(/[*_#`>]/g, "").trim();
  if (!cleanText) {
    throw new ValidationError("Text to synthesize cannot be empty.");
  }

  const endpoint = `${env.gnaniBaseUrl}/api/v1/tts/inference`;
  const model = input.model || env.gnaniTtsModel;
  const voice = input.voice || env.gnaniTtsVoice;
  const rawLang = resolveGnaniLanguageCode(input.language);
  const language = rawLang === "indic-auto" ? "en-IN" : rawLang;
  const speed = input.speed ?? 1;

  return withRetry(
    async () => {
      const ttsTimeoutMs = 6500;
      const res = await withTimeout(
        fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key-ID": apiKey,
          },
          body: JSON.stringify({
            text: cleanText.slice(0, 1200),
            voice,
            model,
            language,
            speed,
            audio_config: {
              encoding: "linear_pcm",
              container: "wav",
              num_channels: 1,
              sample_rate: 24000,
              sample_width: 2,
            },
          }),
          signal: AbortSignal.timeout(ttsTimeoutMs),
        }),
        ttsTimeoutMs + 200,
        "Gnani TTS",
      );

      if (res.status === 429) {
        throw new RateLimitError("Gnani voice synthesis is busy. Please try again shortly.");
      }
      if (res.status === 401 || res.status === 403) {
        throw new ExternalServiceError("Gnani API key is invalid or unauthorized.", 502, "GNANI_AUTH_ERROR");
      }
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        logger.warn("Gnani TTS non-OK status", { status: res.status, bodyPreview: errBody.slice(0, 200) });
        throw new ExternalServiceError("Gnani Text-to-Speech could not generate audio.", 502, "GNANI_TTS_ERROR");
      }

      const contentType = res.headers.get("content-type") || "audio/wav";
      if (contentType.includes("application/json")) {
        const json = (await res.json()) as { audio_base64?: string; audio?: string };
        const b64 = json.audio_base64 || json.audio || "";
        if (!b64) {
          throw new ExternalServiceError("Gnani TTS returned empty audio payload.", 502, "GNANI_TTS_EMPTY");
        }
        return {
          audioBuffer: Buffer.from(b64, "base64"),
          contentType: "audio/wav",
          voice,
          model,
        };
      }

      const arrayBuf = await res.arrayBuffer();
      return {
        audioBuffer: Buffer.from(arrayBuf),
        contentType,
        voice,
        model,
      };
    },
    {
      // Fail fast on slow/rate-limited TTS so browser speech synthesis responds immediately
      maxAttempts: 1,
      baseDelayMs: 150,
      shouldRetry: (err) => !(err instanceof RateLimitError) && isTransientError(err),
    },
  );
}

export function getGnaniVoiceCatalog() {
  return {
    configured: isGnaniConfigured(),
    sttModel: env.gnaniSttModel,
    ttsModel: env.gnaniTtsModel,
    defaultVoice: env.gnaniTtsVoice,
    voices: GNANI_TIMBRE_V3_VOICES,
    supportedLanguages: Object.entries(GNANI_LANGUAGE_MAP).map(([name, code]) => ({ name, code })),
  };
}

