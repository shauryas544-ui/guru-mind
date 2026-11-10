import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { env } from "./config/environment";
import type { TokenVerifier } from "./middleware/authenticate";
import { errorHandler } from "./middleware/errorHandler";
import { requestIdMiddleware } from "./middleware/requestId";
import { createApiRouter } from "./routes";
import { NotFoundError } from "./utils/errors";

export interface AppOptions {
  tokenVerifier?: TokenVerifier;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();

  app.set("trust proxy", 1);
  app.use(requestIdMiddleware);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes(origin) || env.nodeEnv !== "production") {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "256kb" }));

  app.head("/", (_req, res) => {
    res.status(200).end();
  });

  app.get("/", (_req, res) => {
    res.json({
      success: true,
      data: {
        service: "guru-mind-api",
        status: "ok",
        message: "Guru Mind API is running.",
        health: "/api/health",
      },
    });
  });

  app.get("/favicon.ico", (_req, res) => {
    res.status(204).end();
  });

  app.use("/api", createApiRouter({ tokenVerifier: options.tokenVerifier }));

  app.use((_req, _res, next) => {
    next(new NotFoundError("API endpoint not found."));
  });

  app.use(errorHandler);

  return app;
}

