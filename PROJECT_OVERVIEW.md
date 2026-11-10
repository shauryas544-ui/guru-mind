# Guru Mind — Intelligent Language Learning & Mentorship Platform

## Problem
Conventional language apps and generic chatbots focus on one-off translations or surface-level corrections. They rarely remember a learner's recurring habits, explain *why* a mistake happened in the learner's preferred language (such as Hinglish, Hindi, or English), or connect past errors directly into targeted practice and voice conversations.

## Our Solution
**Guru Mind** is an AI-powered personal language tutor and mentor platform designed to transform every conversation into structured diagnostics, durable memory, and adaptive practice. Built around a dual-engine AI architecture and strict per-user data isolation, Guru Mind remembers what you got wrong, explains the root cause clearly, and helps you speak and write with real confidence.

The platform follows a structured learning and feedback pipeline:

**Learner Input (Text / Voice) → Safety & PII Filter → 3-Layer Memory Retrieval → Gemini Inner Council (Tutor, Mentor, Critic, Skeptic) → Deterministic Verification → Validated Memory Update → Adaptive Practice & Insights**

Instead of giving isolated chat replies, Guru Mind diagnoses mistake patterns, tracks concept-level mastery, adapts practice questions automatically, and supports natural Indian-accent and code-mixed Hinglish voice mentorship.

## Key Capabilities
- **AI Inner Council Tutor (`Tutor`):** Structured feedback separating *Jo sahi tha* (what you got right), *Sahi version* (clean correction), and *Kyun galat tha* (why it happened), followed by the next progressive question.
- **Voice AI Mentor (`Mentor`):** Real-time conversational speaking practice with Indian speech-to-text and natural voice synthesis, plus continuous conversation history resume.
- **Three-Layer Memory Architecture:** Deliberately separates **Raw History** (`learning_sessions`, `messages`), **Constant Notes & Memory Cards**, and **Learner Model** (`learner_concepts`) with confidence blending and spaced repetition.
- **Mistake Fingerprint & Echo Twin:** Identifies recurring root causes behind grammar, tense, vocabulary, and L1-transfer errors rather than logging disconnected typos.
- **Adaptive Practice Generator:** Generates fresh Gemini-powered MCQs targeting the learner's weak concepts while avoiding previously seen questions, and updates concept mastery on submission.
- **Weekly Reports & Time Capsules:** Tracks practice momentum and unlocks learner-written time-capsule reflections to show tangible progress over time.
- **Privacy & Export Controls:** Server-side sensitive PII/secret redaction, configurable `save_history` toggle, strict owner-only access isolation, and full JSON/Markdown/HTML data exports or deletion.

## Technology
- **Frontend:** React 19, TypeScript, Vite, TanStack Router, TanStack Query, Tailwind CSS, shadcn/ui, Lucide React, and Recharts.
- **Backend API:** Node.js (v20+), Express, TypeScript, Zod request/response validation, Helmet CSP, and API rate limiting.
- **AI & Speech Engines:** **Google Gemini AI** (`@google/genai`) for Inner Council tutoring, mentorship, and adaptive practice generation; **Gnani AI / Vachana** (`prisma-v3.0` STT and `timbre-v3.0` TTS) with automatic browser Web Speech API fallback.
- **Database & Authentication:** **Supabase PostgreSQL** with Row Level Security (RLS) policies and **Supabase Auth** (Email/Password + OAuth support).
- **Testing & Deployment:** Verified with Vitest + Supertest integration/security tests and hosted as a unified full-stack app on Render.

## Impact
Guru Mind reduces the gap between **everyday practice and lasting fluency** by turning unorganized learner mistakes into diagnostic memory, spoken confidence, and measurable growth—built as a full-stack intelligent learning platform rather than a simple chat wrapper.

**Project:** Guru Mind  
**GitHub Repository:** https://github.com/shauryas544-ui/guru-mind  
**Live Demo:** https://guru-mind.onrender.com

