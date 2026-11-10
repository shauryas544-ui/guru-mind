export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  shouldRetry?: (err: unknown) => boolean;
}

export function isTransientError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const status = (err as { status?: number; statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode;
    if (status === 429 || status === 502 || status === 503 || status === 504) {
      return true;
    }
    const name = (err as { name?: string }).name ?? "";
    const msg = (err as { message?: string }).message ?? "";
    if (name === "AbortError" || /timeout|ECONNRESET|ETIMEDOUT|fetch failed|429|503/i.test(msg)) {
      return true;
    }
  }
  return false;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 400;
  const shouldRetry = opts.shouldRetry ?? isTransientError;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 150);
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt + jitter));
    }
  }
  throw lastError;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = "Operation"): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`${label} timed out after ${timeoutMs}ms`);
          err.name = "AbortError";
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type CacheEntry<T> = { value: T; expiresAt: number };

export class IdempotencyStore {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly ttlMs: number;

  constructor(ttlMs = 120_000) {
    this.ttlMs = ttlMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T): void {
    if (this.cache.size > 2000) {
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (now > v.expiresAt) this.cache.delete(k);
      }
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

export const chatIdempotencyStore = new IdempotencyStore(180_000);

