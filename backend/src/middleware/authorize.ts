import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";
import type { AuthContext } from "../types";

/**
 * Ensures request has verified authentication context.
 * Never trusts userId sent in request body or query params.
 */
export function requireAuthContext(req: Request): AuthContext {
  if (!req.auth?.userId) {
    throw new UnauthorizedError("Authentication required.");
  }
  return req.auth;
}

/**
 * Rejects requests where a client attempts to impersonate another user via body/query user_id.
 */
export function rejectUserSpoofing(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.auth;
  if (!auth) {
    next(new UnauthorizedError("Authentication required."));
    return;
  }

  const bodyUserId = (req.body && (req.body.userId ?? req.body.user_id)) as unknown;
  const queryUserId = (req.query && (req.query.userId ?? req.query.user_id)) as unknown;

  if (typeof bodyUserId === "string" && bodyUserId !== auth.userId) {
    next(new ForbiddenError("Cannot act on behalf of another user."));
    return;
  }
  if (typeof queryUserId === "string" && queryUserId !== auth.userId) {
    next(new ForbiddenError("Cannot query another user's data."));
    return;
  }

  next();
}

export function assertResourceOwner(resourceOwnerId: string | null | undefined, authenticatedUserId: string): void {
  if (!resourceOwnerId || resourceOwnerId !== authenticatedUserId) {
    throw new ForbiddenError("You do not have access to this resource.");
  }
}

