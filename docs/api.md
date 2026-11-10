# Guru Mind — REST API Reference

Base URL (local dev): `http://localhost:4000/api` (proxied automatically via Vite at `/api`).

## Authentication & Conventions

- All endpoints except `GET /api/health` require:
  `Authorization: Bearer <supabase_access_token>`
- User identity is derived exclusively from the verified token. Sending a mismatched `user_id` or `userId` returns `403 FORBIDDEN`.
- JSON responses use consistent envelopes:
  - Success: `{ "success": true, "data": ... }`
  - Error: `{ "success": false, "error": { "code": "...", "message": "...", "requestId": "..." } }`

## Endpoints

### Health & Providers
| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Returns service health and boolean flags indicating whether Gemini AI, Gnani AI, and Supabase are configured (no secrets leaked). |

### Profile & Settings
| Method | Path | Body / Query | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/profile` | — | Fetch (or auto-provision) current user's profile. |
| `PATCH` | `/api/profile` | `full_name`, `native_language`, `learning_language`, `level`, `goal`, `explain_language`, `voice_preference`, `save_history` | Update allowed learner preferences. |

### Sessions
| Method | Path | Body / Query | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/sessions` | `{ mode, language?, title? }` | Start a new learning session (`learn`\|`practice`\|`shadow`\|`test`\|`mentor`). |
| `GET` | `/api/sessions` | `?limit=20&offset=0` | List current user's sessions. |
| `GET` | `/api/sessions/:sessionId` | — | Retrieve an owned session and its ordered messages. |
| `POST` | `/api/sessions/:sessionId/end` | `{ explain? }` | Close session, generate Gemini End-of-Session Review + Homework, save report + Memory Card. |
| `DELETE` | `/api/sessions/:sessionId` | — | Delete an owned session and its messages. |

### AI Chat (Gemini Inner Council) & History
| Method | Path | Headers / Body | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/chat/message` | Optional `Idempotency-Key`; `{ text, mode, explain?, sessionId? }` | Run safety check -> retrieve 3-layer memory -> call Gemini Inner Council -> verify output -> conditionally persist messages, mistakes, patterns, learner concepts, and constant notes. |
| `GET` | `/api/tutor/history` | `?limit=200` | Read ordered non-mentor Tutor messages. |
| `DELETE` | `/api/tutor/history` | — | Clear non-mentor Tutor messages. |
| `GET` | `/api/mentor/history` | `?limit=200` | Read ordered Mentor messages. |
| `DELETE` | `/api/mentor/history` | — | Clear Mentor messages. |

### Learning Memory, Learner Model & Mistakes
| Method | Path | Body / Query | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/memory/notes` | `?limit=50` | Read Constant Notes. |
| `POST` | `/api/memory/notes` | `{ title, content, tag?, language? }` | Append a new Constant Note (screened for PII). |
| `GET` | `/api/memory/cards` | — | List versioned compact Memory Card snapshots. |
| `POST` | `/api/memory/cards` | — | Generate and save a new Memory Card snapshot. |
| `GET` | `/api/learner-model` | — | List concept mastery rows ordered by lowest confidence first. |
| `GET` | `/api/mistakes` | `?limit=100` | List individual mistakes for the Mistake Museum. |
| `GET` | `/api/mistake-patterns` | — | List aggregated Mistake Fingerprint patterns. |

### Adaptive Practice, Time Capsules & Reports
| Method | Path | Body | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/practice/generate` | `{ category, count }` | Generate personalized Gemini MCQs weighted toward weak concepts and top mistake patterns. |
| `POST` | `/api/practice/submit` | `{ results: [{ concept, correct }] }` | Update Learner Model confidence & spaced-repetition intervals after completing a quiz. |
| `GET` | `/api/time-capsules` | — | List sealed and opened Time Capsules. |
| `POST` | `/api/time-capsules` | `{ content, daysFromNow?, targetLanguage? }` | Seal a future reflection message (screened for sensitive info). |
| `PATCH` | `/api/time-capsules/:id/open` | — | Mark a due Time Capsule as opened. |
| `GET` | `/api/reports/weekly` | — | Return 7-day activity & accuracy breakdown, tricky concepts, due reviews, and recent session reports. |

### Gnani AI Voice (STT & TTS)
| Method | Path | Payload | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/voice/config` | — | Return Gnani availability, active STT/TTS models (`prisma-v3.0`, `timbre-v3.0`), voices, and language codes. |
| `POST` | `/api/voice/transcribe` | `multipart/form-data` (`audio`, optional `language`) | Transcribe learner audio via Gnani Prisma STT `/stt/v3`. Max file size 10 MB. |
| `POST` | `/api/voice/synthesize` | `{ text, language?, voice?, speed? }` | Synthesize natural Indian speech via Gnani Timbre TTS `/api/v1/tts/inference`; streams audio bytes (`audio/wav`). |

### Exports & Privacy
| Method | Path | Body | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/exports` | `{ format: "json" \| "markdown" \| "html" }` | Export user's profile, sessions, messages, Constant Notes, Learner Model, Mistakes, and Time Capsules. |
| `DELETE` | `/api/privacy/history` | — | Wipe all learning tables for the authenticated user while retaining login credentials. |
| `DELETE` | `/api/privacy/account` | — | Permanently delete the user account from Supabase Auth (cascades all records). |

