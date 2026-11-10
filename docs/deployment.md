# Guru Mind — Deployment Guide

Guru Mind separates the static/SPA **Frontend (Vercel)**, the **Express API Backend (Render)**, and **Supabase PostgreSQL / Auth**.

## 1. Provision Supabase

1. Create a new Supabase project.
2. Open **SQL Editor** and execute [`database/migrations/0001_initial_schema.sql`](../database/migrations/0001_initial_schema.sql).
3. In **Authentication -> Providers**, ensure Email/Password is enabled (and optionally Google OAuth with your Vercel URL added to Redirect URLs: `https://your-app.vercel.app/dashboard` and `https://your-app.vercel.app/reset-password`).
4. Copy from **Project Settings -> API**:
   - Project URL (`SUPABASE_URL`)
   - Anon / Publishable key (`SUPABASE_ANON_KEY`)
   - Service Role secret key (`SUPABASE_SERVICE_ROLE_KEY`) — **backend only!**

## 2. Obtain Both AI API Keys

1. **Google Gemini API Key (`GEMINI_API_KEY`)**
   - Create a key in Google AI Studio (`https://aistudio.google.com/apikey`).
   - Recommended model: `gemini-3.5-flash-lite` (with automatic hedged failover to `gemini-3-flash-preview` / `gemini-flash-lite-latest`).
2. **Gnani AI Vachana API Key (`GNANI_API_KEY`)**
   - Obtain a Vachana API key from Gnani AI (`https://vachana.ai` / `https://api.vachana.ai`).
   - Uses Prisma STT (`prisma-v3.0`) and Timbre TTS (`timbre-v3.0`).
   - Note: Even if `GNANI_API_KEY` is omitted during initial testing, text tutoring works via Gemini and voice degrades cleanly to browser Web Speech APIs.

## 3. Deploy Backend API to Render

You can either click **New + -> Blueprint** in Render (auto-configured via [`render.yaml`](../render.yaml)) or create a **Web Service** manually:

1. Connect this repository (branch `main`).
2. Set:
   - **Root Directory**: `.` (monorepo root)
   - **Build Command**: `npm ci --include=dev && npm run build --workspace=backend`
   - **Start Command**: `npm run start --workspace=backend`
   - **Health Check Path**: `/api/health`
3. Configure Environment Variables in Render:
   - `NODE_ENV=production`
   - `CORS_ORIGIN=https://your-frontend.vercel.app`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL=gemini-3.5-flash-lite`
   - `GNANI_API_KEY`
   - `GNANI_BASE_URL=https://api.vachana.ai`
   - `GNANI_STT_MODEL=prisma-v3.0`
   - `GNANI_TTS_MODEL=timbre-v3.0`
   - `GNANI_TTS_VOICE=Shivani`
   - `AI_TIMEOUT_MS=15000`
   - `ENABLE_SKEPTIC_SECOND_PASS=false`
4. Verify deployment by opening `https://your-api.onrender.com/api/health`.

## 4. Deploy Frontend to Vercel

1. Import the repository in Vercel.
2. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add **ONLY public** Environment Variables in Vercel (never place `GEMINI_API_KEY`, `GNANI_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` here):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_BASE_URL=https://your-api.onrender.com/api`
4. SPA fallback routing is preconfigured via `frontend/vercel.json` so TanStack Router client-side routes work on refresh.

