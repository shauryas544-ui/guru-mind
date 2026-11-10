import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load backend/.env first if present, then root .env without overriding already-set vars
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const emptyToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

const EnvSchema = z.object({
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(4000)),
  NODE_ENV: z.preprocess(emptyToUndefined, z.enum(["development", "test", "production"]).default("development")),
  CORS_ORIGIN: z.preprocess(emptyToUndefined, z.string().default("http://localhost:5173")),

  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_ANON_KEY: z.string().optional().default(""),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),

  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.preprocess(emptyToUndefined, z.string().default("gemini-3.5-flash-lite")),

  GNANI_API_KEY: z.string().optional().default(""),
  GNANI_BASE_URL: z.preprocess(emptyToUndefined, z.string().default("https://api.vachana.ai")),
  GNANI_STT_MODEL: z.preprocess(emptyToUndefined, z.string().default("prisma-v3.0")),
  GNANI_TTS_MODEL: z.preprocess(emptyToUndefined, z.string().default("timbre-v3.0")),
  GNANI_TTS_VOICE: z.preprocess(emptyToUndefined, z.string().default("Shivani")),

  AI_TIMEOUT_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(2000).max(120000).default(12000)),
  ENABLE_SKEPTIC_SECOND_PASS: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
});

export interface AppEnvironment {
  port: number;
  nodeEnv: "development" | "test" | "production";
  corsOrigins: string[];
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  geminiApiKey: string;
  geminiModel: string;
  gnaniApiKey: string;
  gnaniBaseUrl: string;
  gnaniSttModel: string;
  gnaniTtsModel: string;
  gnaniTtsVoice: string;
  aiTimeoutMs: number;
  enableSkepticSecondPass: boolean;
}

export function loadEnvironment(raw: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const parsed = EnvSchema.parse(raw);
  const supabaseAnonKey = (parsed.SUPABASE_ANON_KEY || parsed.SUPABASE_PUBLISHABLE_KEY || "").trim();

  return {
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    corsOrigins: parsed.CORS_ORIGIN.split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean),
    supabaseUrl: parsed.SUPABASE_URL.trim().replace(/\/+$/, ""),
    supabaseAnonKey,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY.trim(),
    geminiApiKey: parsed.GEMINI_API_KEY.trim(),
    geminiModel: parsed.GEMINI_MODEL.trim(),
    gnaniApiKey: parsed.GNANI_API_KEY.trim(),
    gnaniBaseUrl: parsed.GNANI_BASE_URL.trim().replace(/\/+$/, ""),
    gnaniSttModel: parsed.GNANI_STT_MODEL.trim(),
    gnaniTtsModel: parsed.GNANI_TTS_MODEL.trim(),
    gnaniTtsVoice: parsed.GNANI_TTS_VOICE.trim(),
    aiTimeoutMs: parsed.AI_TIMEOUT_MS,
    enableSkepticSecondPass: parsed.ENABLE_SKEPTIC_SECOND_PASS,
  };
}

export const env: AppEnvironment = loadEnvironment();

