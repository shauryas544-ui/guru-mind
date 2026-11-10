# Guru Mind — AI-Powered Personal Language Tutor & Mentor Platform

Guru Mind helps learners build real fluency through a dual-engine AI architecture:

- **Google Gemini AI (`GEMINI_API_KEY`)**: Powers the **Inner Council** (Tutor, Mentor, Critic, Skeptic, and Response Composer), delivering structured corrections (*Jo sahi tha*, *Sahi version*, *Kyun galat tha*), end-of-session reviews, and adaptive practice quizzes.
- **Gnani AI Vachana (`GNANI_API_KEY`)**: Powers Indian-accent and code-mixed Hinglish **Speech-to-Text (`prisma-v3.0`)** and natural Indian **Text-to-Speech (`timbre-v3.0`)** voice mentorship, with graceful browser Web Speech fallback.
- **Supabase PostgreSQL + Auth + RLS**: Provides per-user data isolation across the 3 separate memory layers (**Raw History**, **Constant Notes**, **Learner Model**) plus **Mistake Fingerprint**, **Echo Twin**, **Time Capsule**, and **Privacy/Export** controls.

---

## Project Architecture & Folder Structure

```text
guru-mind/
├── frontend/                  # Vite + React 19 + TanStack Router + Tailwind + shadcn/ui SPA
│   ├── public/
│   └── src/
│       ├── components/        # AppShell, Logo, 46 shadcn/ui components
│       ├── hooks/             # useGnaniVoice (STT + TTS), useIsMobile
│       ├── integrations/      # Supabase browser auth client
│       ├── lib/               # language, learner-stats, tutor API wrappers
│       ├── routes/            # /, /auth, /reset-password, /_authenticated/*
│       ├── services/api.ts    # Typed backend REST client
│       └── types/api.ts       # Shared API contracts
├── backend/                   # Express + TypeScript Trusted API Boundary
│   └── src/
│       ├── config/            # Environment validation & RLS/admin Supabase clients
│       ├── middleware/        # RequestId, JWT auth, anti-spoofing, Zod validation, rate limits
│       ├── modules/           # profile, sessions, chat, tutor, memory, mistakes, practice, voice, reports, exports, timeCapsules
│       └── services/
│           ├── ai/            # geminiProvider, gnaniProvider, aiOrchestrator, responseVerifier
│           ├── memory/        # 3-layer memory retrieval & validated updates
│           ├── prompts/       # Structured Tutor/Mentor Inner Council prompts
│           ├── safety/        # Sensitive PII / credential scanner & redactor
│           └── scheduler/     # Weekly analytics & spaced-repetition aggregation
├── database/
│   ├── schema.sql             # 10 normalized tables + auth signup trigger
│   ├── policies.sql           # Strict owner-only RLS policies & grants
│   └── migrations/0001_initial_schema.sql
├── tests/
│   ├── unit/                  # Safety filter, prompt builder, verifier, Gnani provider tests
│   ├── integration/           # Full Express API chat & health integration tests
│   └── security/              # Cross-user isolation & RLS coverage checks
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── api.md
│   └── deployment.md
├── .env.example
└── package.json
```

---

## Prerequisites

1. **Node.js v20+ LTS** (includes `npm`)
   - On Windows: install from [nodejs.org](https://nodejs.org/) or run `winget install OpenJS.NodeJS.LTS`, then restart your terminal.
2. A **Supabase** project ([supabase.com](https://supabase.com))
3. A **Google Gemini API Key** ([aistudio.google.com/apikey](https://aistudio.google.com/apikey))
4. A **Gnani AI Vachana API Key** ([vachana.ai](https://vachana.ai))

---

## Local Setup Instructions

### 1. Provision the Database
1. Open your Supabase project -> **SQL Editor**.
2. Paste and run the contents of `database/migrations/0001_initial_schema.sql`.

### 2. Configure Environment Variables
1. Copy `.env.example` to `.env` in the repository root (`frontend` automatically reads `VITE_*` variables from the root `.env` without exposing any backend keys to the browser):
   ```powershell
   Copy-Item .env.example .env
   ```
2. Fill in your server-side credentials in `.env`:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
   - `GNANI_API_KEY`
3. In the same `.env`, set the two public Supabase keys for the frontend:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_BASE_URL=/api`

> **Security Note:** Never prefix `GEMINI_API_KEY`, `GNANI_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` with `VITE_`, and never commit `.env` to git.

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Development Servers (Frontend + Backend together)
```bash
npm run dev
```
- **Frontend SPA**: `http://localhost:5173`
- **Backend API**: `http://localhost:4000` (Vite proxies `/api/*` requests directly to `http://localhost:4000`)

### 5. Run Verification Checks
```bash
npm run typecheck
npm test
npm run test:frontend
npm run build
```

---

## Documentation
- [System Architecture](docs/architecture.md)
- [Database & RLS Design](docs/database.md)
- [REST API Specification](docs/api.md)
- [Deployment Guide (Render + Vercel + Supabase)](docs/deployment.md)
