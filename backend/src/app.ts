import fs from "node:fs";
import path from "node:path";
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
  serveSpa?: boolean;
  frontendDistDir?: string;
}

function resolveFrontendDistDir(explicitDir?: string): string | null {
  const candidates = explicitDir
    ? [explicitDir]
    : [
        path.resolve(process.cwd(), "frontend/dist"),
        path.resolve(process.cwd(), "../frontend/dist"),
      ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) {
      return dir;
    }
  }
  return null;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();

  app.set("trust proxy", 1);
  app.use(requestIdMiddleware);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          mediaSrc: ["'self'", "blob:"],
          connectSrc: [
            "'self'",
            "blob:",
            "https://*.supabase.co",
            "wss://*.supabase.co",
            ...(env.supabaseUrl ? [env.supabaseUrl] : []),
          ],
        },
      },
    }),
  );
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

  app.use("/api", createApiRouter({ tokenVerifier: options.tokenVerifier }));
  app.use("/api", (_req, _res, next) => {
    next(new NotFoundError("API endpoint not found."));
  });

  const shouldServeSpa = options.serveSpa ?? env.nodeEnv !== "test";
  const frontendDistDir = shouldServeSpa ? resolveFrontendDistDir(options.frontendDistDir) : null;

  if (frontendDistDir) {
    const indexHtmlPath = path.join(frontendDistDir, "index.html");
    app.use(express.static(frontendDistDir));
    app.use((req, res, next) => {
      if (req.method === "GET" || req.method === "HEAD") {
        res.sendFile(indexHtmlPath);
        return;
      }
      next();
    });
  } else {
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
  }

  app.use((_req, _res, next) => {
    next(new NotFoundError("API endpoint not found."));
  });

  app.use(errorHandler);

  return app;
}

