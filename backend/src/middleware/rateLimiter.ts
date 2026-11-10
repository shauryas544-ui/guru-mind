import type { NextFunction, Request, Response } from "express";
import { RateLimitError } from "../utils/errors";

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(opts: { windowMs: number; maxRequests: number; keyPrefix?: string }) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const identity = req.auth?.userId ?? req.ip ?? "unknown";
    const key = `${opts.keyPrefix ?? "api"}:${identity}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(opts.maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, opts.maxRequests - bucket.count)));

    if (bucket.count > opts.maxRequests) {
      next(new RateLimitError("Too many requests. Please slow down and try again shortly."));
      return;
    }

    if (buckets.size > 5000) {
      for (const [k, b] of buckets.entries()) {
        if (now >= b.resetAt) buckets.delete(k);
      }
    }

    next();
  };
}

export const generalRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 120,
  keyPrefix: "general",
});

export const aiRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: "ai",
});

