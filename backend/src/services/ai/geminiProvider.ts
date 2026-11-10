import dns from "node:dns";
import { GoogleGenAI, ThinkingLevel, Type, type Schema } from "@google/genai";
import { env } from "../../config/environment";
import { ExternalServiceError, RateLimitError, ServiceUnavailableError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { withTimeout } from "../../utils/retry";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

export { Type as GeminiSchemaType, type Schema as GeminiSchema };

let cachedClient: GoogleGenAI | null = null;
let cachedKey = "";
let preferredHealthyModel: string | null = null;
const modelCooldownUntil = new Map<string, number>();

const FAST_GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
];

function hasUsableKey(val: string | undefined): boolean {
  const trimmed = val?.trim() ?? "";
  return trimmed.length > 0 && !trimmed.startsWith("your-");
}

function getGeminiClient(): GoogleGenAI {
  if (!hasUsableKey(env.geminiApiKey)) {
    throw new ServiceUnavailableError(
      "Gemini AI is not configured. Set GEMINI_API_KEY in your .env file.",
    );
  }
  const key = env.geminiApiKey.trim();
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new GoogleGenAI({
      apiKey: key,
      // Disable SDK's hidden 5x retry loop so slow/overloaded models fail over immediately
      httpOptions: {
        timeout: env.aiTimeoutMs,
        retryOptions: { attempts: 1 },
      },
    });
    cachedKey = key;
  }
  return cachedClient;
}

export function isGeminiConfigured(): boolean {
  return hasUsableKey(env.geminiApiKey);
}

export function resetGeminiModelHealth(): void {
  preferredHealthyModel = null;
  modelCooldownUntil.clear();
}

export interface GeminiJsonRequest {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: Schema;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  hedgeDelayMs?: number;
  model?: string;
}

function getThinkingConfig(
  model: string,
): { thinkingBudget?: number; thinkingLevel?: ThinkingLevel } | undefined {
  const normalized = model.toLowerCase();
  if (normalized.includes("3.1-flash-lite")) {
    return { thinkingBudget: 0 };
  }
  if (normalized.includes("3.5-flash") && !normalized.includes("3.5-flash-lite")) {
    return { thinkingBudget: 0 };
  }
  if (normalized.includes("3.5-flash-lite") || normalized.includes("3-flash")) {
    return { thinkingLevel: ThinkingLevel.MINIMAL };
  }
  return undefined;
}

function parseGeminiJsonPayload<T>(rawText: string): T {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Strip markdown fences or prose wrappers like "Here is the JSON requested:"
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim()) as T;
      } catch {
        // continue to brace slice
      }
    }
    const firstObj = trimmed.indexOf("{");
    const lastObj = trimmed.lastIndexOf("}");
    if (firstObj !== -1 && lastObj > firstObj) {
      try {
        return JSON.parse(trimmed.slice(firstObj, lastObj + 1)) as T;
      } catch {
        // continue
      }
    }
    const firstArr = trimmed.indexOf("[");
    const lastArr = trimmed.lastIndexOf("]");
    if (firstArr !== -1 && lastArr > firstArr) {
      try {
        return JSON.parse(trimmed.slice(firstArr, lastArr + 1)) as T;
      } catch {
        // fall through
      }
    }
    throw new ExternalServiceError(
      "Gemini returned malformed structured output.",
      502,
      "GEMINI_PARSE_ERROR",
    );
  }
}

function isAuthModelError(err: unknown): boolean {
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;
  if (status === 401 || status === 403) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /API_KEY_INVALID|permission/i.test(msg);
}

function isNotFoundModelError(err: unknown): boolean {
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;
  if (status === 404) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /NOT_FOUND|no longer available|\b404\b/i.test(msg);
}

function isModelFailoverEligible(err: unknown): boolean {
  if (isAuthModelError(err)) return false;
  if (isNotFoundModelError(err)) return true;
  if (
    err instanceof ExternalServiceError &&
    (err.code === "GEMINI_PARSE_ERROR" || err.code === "GEMINI_EMPTY_RESPONSE")
  ) {
    return true;
  }
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;
  if (status === 503 || status === 504 || status === 429 || status === 408 || status === 400) {
    return true;
  }
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);
  return (
    name === "AbortError" ||
    name === "TimeoutError" ||
    /high demand|UNAVAILABLE|Retryable HTTP Error|Non-retryable exception|aborted|timed out|AbortError|TimeoutError|RESOURCE_EXHAUSTED|\b503\b|\b504\b|\b429\b/i.test(
      msg,
    )
  );
}

function mapGeminiError(err: unknown): Error {
  if (
    err instanceof ServiceUnavailableError ||
    err instanceof ExternalServiceError ||
    err instanceof RateLimitError
  ) {
    return err;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;

  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)) {
    return new RateLimitError("Gemini AI is temporarily busy. Please try again in a moment.");
  }
  if (status === 503 || /UNAVAILABLE|high demand|Retryable HTTP Error/i.test(msg)) {
    return new ServiceUnavailableError(
      "Gemini AI is temporarily overloaded. Please try again in a moment.",
    );
  }
  if (status === 401 || status === 403 || /API_KEY_INVALID|permission/i.test(msg)) {
    return new ExternalServiceError(
      "Gemini API key is invalid or unauthorized.",
      502,
      "GEMINI_AUTH_ERROR",
    );
  }
  if (/timed out|aborted|AbortError|TimeoutError/i.test(msg)) {
    return new ExternalServiceError(
      "Gemini AI took too long to respond. Please try again.",
      504,
      "AI_TIMEOUT",
    );
  }
  return new ExternalServiceError(
    "Gemini AI could not process the request. Please try again.",
    502,
    "GEMINI_ERROR",
  );
}

function getOrderedCandidates(explicitModel?: string): string[] {
  if (explicitModel) return [explicitModel];

  const base = Array.from(
    new Set(
      [preferredHealthyModel, env.geminiModel, ...FAST_GEMINI_MODELS].filter(
        (m): m is string => Boolean(m && m.trim()),
      ),
    ),
  );

  const now = Date.now();
  const healthy = base.filter((m) => (modelCooldownUntil.get(m) ?? 0) <= now);
  const cooling = base
    .filter((m) => (modelCooldownUntil.get(m) ?? 0) > now)
    .sort((a, b) => (modelCooldownUntil.get(a) ?? 0) - (modelCooldownUntil.get(b) ?? 0));

  return healthy.length > 0 ? [...healthy, ...cooling.slice(0, 1)] : cooling;
}

/**
 * Runs structured JSON generation against Gemini with staggered hedged parallel failover:
 * starts the primary healthy model immediately, hedges into backup fast models when
 * pending (or immediately on failure), aborts slower calls once a valid JSON response lands,
 * and performs one brief backoff retry if all candidates hit transient overload.
 */
export async function generateGeminiJson<T>(request: GeminiJsonRequest): Promise<T> {
  try {
    return await runHedgedGeminiAttempt<T>(request);
  } catch (err) {
    if (!request.model && isTransientServiceError(err)) {
      logger.warn("Transient Gemini overload across candidates, retrying primary once", {
        model: preferredHealthyModel || env.geminiModel || FAST_GEMINI_MODELS[0],
      });
      await new Promise((r) => setTimeout(r, 700));
      return runHedgedGeminiAttempt<T>({
        ...request,
        model: FAST_GEMINI_MODELS[0],
        timeoutMs: Math.max(request.timeoutMs ?? env.aiTimeoutMs, 12_000),
      });
    }
    throw err;
  }
}

function isTransientServiceError(err: unknown): boolean {
  return (
    err instanceof RateLimitError ||
    err instanceof ServiceUnavailableError ||
    (err instanceof ExternalServiceError && err.code === "AI_TIMEOUT")
  );
}

async function runHedgedGeminiAttempt<T>(request: GeminiJsonRequest): Promise<T> {
  const client = getGeminiClient();
  const candidateModels = getOrderedCandidates(request.model);
  const perAttemptTimeoutMs = request.timeoutMs ?? env.aiTimeoutMs;
  const maxCandidates = request.model ? 1 : Math.min(candidateModels.length, 4);
  const hedgeDelayMs = request.model || maxCandidates <= 1 ? 0 : (request.hedgeDelayMs ?? 2800);
  const maxInFlight = 2;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let nextIdx = 0;
    let inFlight = 0;
    let lastErr: unknown;
    let hedgeTimer: ReturnType<typeof setTimeout> | null = null;
    const controllers = new Set<AbortController>();

    const cleanup = () => {
      if (hedgeTimer) {
        clearTimeout(hedgeTimer);
        hedgeTimer = null;
      }
      for (const c of controllers) {
        c.abort();
      }
      controllers.clear();
    };

    const scheduleHedge = () => {
      if (hedgeTimer) {
        clearTimeout(hedgeTimer);
        hedgeTimer = null;
      }
      if (settled || hedgeDelayMs <= 0 || nextIdx >= maxCandidates) return;
      hedgeTimer = setTimeout(() => {
        if (settled || nextIdx >= maxCandidates) return;
        if (inFlight < maxInFlight) {
          logger.info("Gemini response pending, hedging with backup model", {
            nextModel: candidateModels[nextIdx],
          });
          launchNext();
        } else {
          scheduleHedge();
        }
      }, hedgeDelayMs);
    };

    const launchNext = () => {
      if (settled || nextIdx >= maxCandidates) return;
      const model = candidateModels[nextIdx]!;
      nextIdx += 1;
      inFlight += 1;

      const controller = new AbortController();
      controllers.add(controller);
      const timeoutHandle = setTimeout(() => controller.abort(), perAttemptTimeoutMs);
      const thinkingConfig = getThinkingConfig(model);

      scheduleHedge();

      void (async () => {
        try {
          const response = await withTimeout(
            client.models.generateContent({
              model,
              contents: request.userPrompt,
              config: {
                systemInstruction: request.systemInstruction,
                responseMimeType: "application/json",
                responseSchema: request.responseSchema,
                temperature: request.temperature ?? 0.5,
                ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
                ...(thinkingConfig ? { thinkingConfig } : {}),
                abortSignal: controller.signal,
                httpOptions: {
                  timeout: perAttemptTimeoutMs,
                  retryOptions: { attempts: 1 },
                },
              },
            }),
            perAttemptTimeoutMs + 250,
            `Gemini (${model})`,
          );

          const rawText = response.text;
          if (!rawText || !rawText.trim()) {
            throw new ExternalServiceError(
              "Gemini returned an empty response.",
              502,
              "GEMINI_EMPTY_RESPONSE",
            );
          }

          const parsed = parseGeminiJsonPayload<T>(rawText);

          if (!settled) {
            settled = true;
            preferredHealthyModel = model;
            modelCooldownUntil.delete(model);
            cleanup();
            resolve(parsed);
          }
        } catch (err) {
          if (settled) return;
          lastErr = err;

          if (isNotFoundModelError(err)) {
            modelCooldownUntil.set(model, Date.now() + 30 * 60_000);
          } else if (isModelFailoverEligible(err)) {
            modelCooldownUntil.set(model, Date.now() + 35_000);
            if (preferredHealthyModel === model) preferredHealthyModel = null;
          }

          if (!isModelFailoverEligible(err)) {
            settled = true;
            cleanup();
            logger.error("Gemini provider failure", {
              model,
              error: err instanceof Error ? err : new Error(String(err)),
            });
            reject(mapGeminiError(err));
            return;
          }

          logger.warn("Gemini candidate failed, switching cleanly", {
            failedModel: model,
            nextModel: nextIdx < maxCandidates ? (candidateModels[nextIdx] ?? "none") : "none",
          });
        } finally {
          clearTimeout(timeoutHandle);
          controllers.delete(controller);
          inFlight -= 1;

          if (!settled) {
            if (nextIdx < maxCandidates && inFlight < maxInFlight) {
              launchNext();
            } else if (inFlight === 0 && nextIdx >= maxCandidates) {
              settled = true;
              cleanup();
              logger.error("All Gemini candidates failed", {
                error: lastErr instanceof Error ? lastErr : new Error(String(lastErr)),
              });
              reject(mapGeminiError(lastErr));
            }
          }
        }
      })();
    };

    launchNext();
  });
}
