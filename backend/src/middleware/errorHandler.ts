import type { NextFunction, Request, Response } from "express";
import { isMissingSchemaError } from "../config/database";
import { env } from "../config/environment";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId ?? "unknown";

  if (err instanceof AppError) {
    logger.warn("Handled application error", {
      requestId,
      code: err.code,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      message: err.message,
    });

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        requestId,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Handle Multer upload errors gracefully
  if (err && typeof err === "object" && "code" in err && (err as { name?: string }).name === "MulterError") {
    const message = (err as { message?: string }).message || "Invalid file upload.";
    res.status(400).json({
      success: false,
      error: {
        code: "UPLOAD_ERROR",
        message,
        requestId,
      },
    });
    return;
  }

  const errorObj = err instanceof Error ? err : new Error(String(err));
  if (isMissingSchemaError(err) || isMissingSchemaError(errorObj)) {
    logger.warn("Database tables missing in Supabase schema cache", {
      requestId,
      path: req.path,
      method: req.method,
      message: errorObj.message,
    });
    res.status(503).json({
      success: false,
      error: {
        code: "DATABASE_NOT_INITIALIZED",
        message:
          "Database tables are missing in Supabase. Run database/migrations/0001_initial_schema.sql in your Supabase SQL Editor once.",
        requestId,
      },
    });
    return;
  }

  logger.error("Unhandled server error", {
    requestId,
    path: req.path,
    method: req.method,
    error: errorObj,
  });

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message:
        env.nodeEnv === "production"
          ? "An unexpected error occurred. Please try again."
          : errorObj.message,
      requestId,
    },
  });
}

