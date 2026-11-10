import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function isOpaqueSupabaseKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isOpaqueSupabaseKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export function isSupabaseConfigured(): boolean {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  const key = String(
    import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
  ).trim();
  return Boolean(
    url && key && /^https?:\/\//i.test(url) && !url.includes("your-") && !key.startsWith("your-"),
  );
}

function createSupabaseClient(): SupabaseClient {
  const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  const SUPABASE_KEY = String(
    import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
  ).trim();

  if (!isSupabaseConfigured()) {
    throw new Error(
      "Missing Supabase public configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your root .env file.",
    );
  }

  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_KEY),
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: SupabaseClient | undefined;

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
