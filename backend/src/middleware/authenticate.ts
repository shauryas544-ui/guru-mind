import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createUserSupabaseClient } from "../config/database";
import { UnauthorizedError } from "../utils/errors";
import type { AuthContext } from "../types";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: AuthContext;
    }
  }
}

export type TokenVerifier = (token: string) => Promise<AuthContext>;

interface CachedVerifiedToken {
  userId: string;
  email: string;
  expiresAt: number;
}

const TOKEN_CACHE_TTL_MS = 45_000;
const verifiedTokenCache = new Map<string, CachedVerifiedToken>();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function readJwtExpiryMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(payloadJson) as { exp?: number };
    return typeof parsed.exp === "number" ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function clearTokenVerificationCache(token?: string): void {
  if (token) {
    verifiedTokenCache.delete(hashToken(token));
    return;
  }
  verifiedTokenCache.clear();
}

export async function defaultTokenVerifier(token: string): Promise<AuthContext> {
  if (token.split(".").length !== 3) {
    throw new UnauthorizedError("Invalid authentication token format.");
  }

  const supabase = createUserSupabaseClient(token);
  const key = hashToken(token);
  const now = Date.now();
  const cached = verifiedTokenCache.get(key);
  if (cached && now < cached.expiresAt) {
    return {
      userId: cached.userId,
      email: cached.email,
      token,
      supabase,
    };
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user?.id) {
    verifiedTokenCache.delete(key);
    throw new UnauthorizedError("Invalid or expired session token.");
  }

  const jwtExpMs = readJwtExpiryMs(token);
  const cacheUntil = jwtExpMs
    ? Math.min(now + TOKEN_CACHE_TTL_MS, jwtExpMs - 5_000)
    : now + TOKEN_CACHE_TTL_MS;

  if (cacheUntil > now) {
    if (verifiedTokenCache.size > 2000) {
      for (const [k, v] of verifiedTokenCache.entries()) {
        if (now >= v.expiresAt) verifiedTokenCache.delete(k);
      }
    }
    verifiedTokenCache.set(key, {
      userId: data.user.id,
      email: data.user.email ?? "",
      expiresAt: cacheUntil,
    });
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? "",
    token,
    supabase,
  };
}

export function createAuthenticateMiddleware(verifier: TokenVerifier = defaultTokenVerifier) {
  return async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.header("authorization");
      if (!authHeader) {
        throw new UnauthorizedError("Missing Authorization header.");
      }
      if (!authHeader.startsWith("Bearer ")) {
        throw new UnauthorizedError("Authorization header must use Bearer token scheme.");
      }

      const token = authHeader.slice("Bearer ".length).trim();
      if (!token) {
        throw new UnauthorizedError("Missing Bearer token.");
      }

      req.auth = await verifier(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const authenticate = createAuthenticateMiddleware();
