const REDACTED_KEYS = new Set([
  "authorization",
  "x-api-key-id",
  "apikey",
  "gemini_api_key",
  "gnani_api_key",
  "supabase_service_role_key",
  "password",
  "token",
  "access_token",
]);

function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (REDACTED_KEYS.has(k.toLowerCase())) {
      clean[k] = "[REDACTED]";
    } else if (v instanceof Error) {
      clean[k] = { name: v.name, message: v.message };
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    const clean = sanitizeMeta(meta);
    console.info(JSON.stringify({ level: "info", ts: new Date().toISOString(), message, ...(clean ? { meta: clean } : {}) }));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    const clean = sanitizeMeta(meta);
    console.warn(JSON.stringify({ level: "warn", ts: new Date().toISOString(), message, ...(clean ? { meta: clean } : {}) }));
  },
  error(message: string, meta?: Record<string, unknown>) {
    const clean = sanitizeMeta(meta);
    console.error(JSON.stringify({ level: "error", ts: new Date().toISOString(), message, ...(clean ? { meta: clean } : {}) }));
  },
};

