import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { createApp } from "./app";
import { isSupabaseBackendConfigured } from "./config/database";
import { env } from "./config/environment";
import { isGeminiConfigured } from "./services/ai/geminiProvider";
import { isGnaniConfigured, warmGnaniConnection } from "./services/ai/gnaniProvider";
import { logger } from "./utils/logger";

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info("Guru Mind API server listening", {
    port: env.port,
    nodeEnv: env.nodeEnv,
    geminiConfigured: isGeminiConfigured(),
    gnaniConfigured: isGnaniConfigured(),
    supabaseConfigured: isSupabaseBackendConfigured(),
  });
  void warmGnaniConnection();
});

function shutdown(signal: string) {
  logger.info("Shutting down Guru Mind API server", { signal });
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

