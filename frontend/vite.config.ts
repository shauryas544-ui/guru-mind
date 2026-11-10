import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(rootDir, "..");

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, repoRoot, "");
  const fallbackDefines: Record<string, string> = {};

  const hasViteSupabaseUrl = Boolean(
    (fileEnv.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim(),
  );
  if (!hasViteSupabaseUrl) {
    const supabaseUrl = (fileEnv.SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
    if (supabaseUrl) {
      fallbackDefines["import.meta.env.VITE_SUPABASE_URL"] = JSON.stringify(supabaseUrl);
    }
  }

  const hasViteSupabaseAnon = Boolean(
    (
      fileEnv.VITE_SUPABASE_ANON_KEY ||
      fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      ""
    ).trim(),
  );
  if (!hasViteSupabaseAnon) {
    const supabaseAnon = (
      fileEnv.SUPABASE_ANON_KEY ||
      fileEnv.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      ""
    ).trim();
    if (supabaseAnon) {
      fallbackDefines["import.meta.env.VITE_SUPABASE_ANON_KEY"] = JSON.stringify(supabaseAnon);
    }
  }

  return {
    envDir: repoRoot,
    ...(Object.keys(fallbackDefines).length > 0 ? { define: fallbackDefines } : {}),
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
      tsconfigPaths(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "./src"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: process.env.VITE_BACKEND_PROXY_TARGET || "http://localhost:4000",
          changeOrigin: true,
        },
      },
    },
  };
});
