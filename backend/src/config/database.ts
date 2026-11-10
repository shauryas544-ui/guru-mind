import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./environment";
import { ServiceUnavailableError } from "../utils/errors";

const MISSING_SCHEMA_CACHE_MS = 15_000;
let missingSchemaUntil = 0;

export function isMissingSchemaCached(): boolean {
  if (env.nodeEnv === "test") return false;
  return Date.now() < missingSchemaUntil;
}

export function markSchemaMissing(): void {
  if (env.nodeEnv === "test") return;
  missingSchemaUntil = Date.now() + MISSING_SCHEMA_CACHE_MS;
}

export function clearMissingSchemaCache(): void {
  missingSchemaUntil = 0;
}

function isOpaqueSupabaseKey(key: string): boolean {
  return key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
}

function buildSupabaseFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isOpaqueSupabaseKey(apiKey) && headers.get("Authorization") === `Bearer ${apiKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}

export function isMissingSchemaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = "message" in err ? String((err as { message?: unknown }).message ?? "") : "";
  const code = "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    /could not find the table ['"]?public\./i.test(msg) ||
    /relation ['"]?public\.\w+['"]? does not exist/i.test(msg)
  );
}

export function isSupabaseBackendConfigured(): boolean {
  return Boolean(
    env.supabaseUrl &&
      env.supabaseAnonKey &&
      /^https?:\/\//i.test(env.supabaseUrl) &&
      !env.supabaseUrl.includes("your-") &&
      !env.supabaseAnonKey.startsWith("your-"),
  );
}

export function assertSupabaseConfigured(): { url: string; anonKey: string } {
  if (!isSupabaseBackendConfigured()) {
    throw new ServiceUnavailableError(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.",
    );
  }
  return { url: env.supabaseUrl, anonKey: env.supabaseAnonKey };
}

/**
 * Creates a request-scoped Supabase client using the caller's verified JWT.
 * PostgreSQL Row Level Security (RLS) enforces strict per-user isolation on every query.
 */
export function createUserSupabaseClient(accessToken: string): SupabaseClient {
  const { url, anonKey } = assertSupabaseConfigured();
  return createClient(url, anonKey, {
    global: {
      fetch: buildSupabaseFetch(anonKey),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

let cachedAdminClient: SupabaseClient | null = null;

/**
 * Server-side service-role client (bypasses RLS).
 * Use ONLY for trusted administrative tasks like account deletion or scheduled jobs.
 */
export function getAdminSupabaseClient(): SupabaseClient {
  if (
    !isSupabaseBackendConfigured() ||
    !env.supabaseServiceRoleKey ||
    env.supabaseServiceRoleKey.startsWith("your-")
  ) {
    throw new ServiceUnavailableError(
      "SUPABASE_SERVICE_ROLE_KEY is required for administrative database operations.",
    );
  }
  if (!cachedAdminClient) {
    cachedAdminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      global: {
        fetch: buildSupabaseFetch(env.supabaseServiceRoleKey),
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedAdminClient;
}

