import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../backend/src/app";
import type { AuthContext } from "../../backend/src/types";

function createFakeSupabase(userId: string) {
  const store: Record<string, Array<Record<string, unknown>>> = {
    profiles: [
      {
        id: userId,
        full_name: "Test Learner",
        native_language: "Hindi",
        learning_language: "English",
        level: "Beginner",
        goal: "Speak fluently",
        explain_language: "Hinglish",
        voice_preference: "Shivani",
        save_history: true,
      },
    ],
    learning_sessions: [],
    messages: [],
    constant_notes: [],
    learner_concepts: [],
    mistakes: [],
    mistake_patterns: [],
    memory_cards: [],
    time_capsules: [],
    reports: [],
  };

  const makeBuilder = (table: string) => {
    let rows = [...(store[table] ?? [])];
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const items = Array.isArray(payload) ? payload : [payload];
        const inserted = items.map((item, i) => ({
          id: `${table}-${store[table].length + i + 1}`,
          created_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          ...item,
        }));
        store[table].push(...inserted);
        rows = inserted;
        return builder;
      },
      update: (updates: Record<string, unknown>) => {
        for (const r of store[table]) {
          if (filters.every((fn) => fn(r))) Object.assign(r, updates);
        }
        rows = store[table].filter((r) => filters.every((fn) => fn(r)));
        return builder;
      },
      delete: () => {
        store[table] = store[table].filter((r) => !filters.every((fn) => fn(r)));
        rows = [];
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return builder;
      },
      neq: (col: string, val: unknown) => {
        filters.push((r) => r[col] !== val);
        return builder;
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => (r[col] ?? null) === val);
        return builder;
      },
      gte: () => builder,
      lte: () => builder,
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      single: async () => {
        const matched = rows.filter((r) => filters.every((fn) => fn(r)));
        return { data: matched[0] ?? rows[0] ?? null, error: null };
      },
      maybeSingle: async () => {
        const matched = store[table].filter((r) => filters.every((fn) => fn(r)));
        return { data: matched[0] ?? null, error: null };
      },
      then: (resolve: (val: { data: unknown[]; error: null }) => void) => {
        const matched = store[table].filter((r) => filters.every((fn) => fn(r)));
        resolve({ data: matched, error: null });
      },
    };
    return builder;
  };

  return {
    from: (table: string) => makeBuilder(table),
  } as unknown as AuthContext["supabase"];
}

vi.mock("../../backend/src/services/ai/aiOrchestrator", () => ({
  orchestrateChatTurn: vi.fn(async () => ({
    reply: "Acha try kiya! Habit sentences mein 'am' use nahi karte.",
    joSahiTha: "Your word order for subject and place was clear.",
    corrections: [
      {
        original: "I am go to college.",
        corrected: "I go to college.",
        explanation: "Routine batane ke liye Present Simple mein 'am' nahi lagta.",
        root_cause: "Mixing 'am' with present simple",
        concept: "Present Simple",
        category: "grammar",
      },
    ],
    nextQuestion: "Ab aap batayein: aap roz subah kya karte hain?",
    memoryCandidates: [{ concept: "Present Simple", status: "weak", confidence: 0.55 }],
    constantNoteCandidate: null,
    councilNotes: { criticSummary: "Verified Present Simple error", skepticVerified: true },
  })),
  generateEndOfSessionReview: vi.fn(async () => ({
    summary: "Practised Present Simple routines.",
    mistakeReview: ["Dropped 'am' before action verbs."],
    homework: "Write 5 daily routine sentences.",
    nextSessionGuidance: "Review Past Simple next.",
    constantNote: null,
  })),
  generateAdaptivePracticeQuestions: vi.fn(async (params: { topic?: string; excludeQuestions?: string[] }) => [
    {
      id: "g-1",
      question: `Fresh Gemini question about ${params.topic || "grammar"}`,
      options: ["A", "B", "C", "D"],
      correctIndex: 1,
      explanation: "Clear explanation",
      concept: params.topic || "Present Simple",
    },
  ]),
}));

describe("API integration", () => {
  const userASupabase = createFakeSupabase("user-a-uuid");
  const app = createApp({
    tokenVerifier: async (token) => {
      if (token === "valid-token-a") {
        return { userId: "user-a-uuid", email: "a@example.com", token, supabase: userASupabase };
      }
      throw new Error("Invalid token");
    },
  });

  it("exposes GET /api/health without leaking secrets", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.service).toBe("guru-mind-api");
    expect(JSON.stringify(res.body)).not.toContain("GEMINI_API_KEY");
  });

  it("rejects protected endpoints without Bearer token", async () => {
    const res = await request(app).post("/api/chat/message").send({ text: "Hello", mode: "learn" });
    expect(res.status).toBe(401);
  });

  it("processes chat turn through Gemini orchestrator and updates memory", async () => {
    const res = await request(app)
      .post("/api/chat/message")
      .set("Authorization", "Bearer valid-token-a")
      .send({ text: "I am go to college.", mode: "learn", explain: "Hinglish" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.joSahiTha).toContain("word order");
    expect(res.body.data.corrections).toHaveLength(1);
    expect(res.body.data.corrections[0].corrected).toBe("I go to college.");
  });

  it("updates learner_concepts when practice outcomes are submitted", async () => {
    const res = await request(app)
      .post("/api/practice/submit")
      .set("Authorization", "Bearer valid-token-a")
      .send({
        results: [
          { concept: "Present Simple", correct: true },
          { concept: "Articles", correct: false },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updatedCount).toBe(2);
  });

  it("serves live mentor reply with persistenceWarning when database tables are not created yet", async () => {
    const pgrst205Error = {
      code: "PGRST205",
      message: "Could not find the table 'public.learning_sessions' in the schema cache",
    };
    const emptyDbClient = {
      from: () => {
        const q: Record<string, unknown> = {
          select: () => q,
          insert: () => q,
          eq: () => q,
          neq: () => q,
          is: () => q,
          order: () => q,
          limit: () => q,
          single: async () => ({ data: null, error: pgrst205Error }),
          maybeSingle: async () => ({ data: null, error: pgrst205Error }),
          then: (resolve: (val: { data: null; error: typeof pgrst205Error }) => void) =>
            resolve({ data: null, error: pgrst205Error }),
        };
        return q;
      },
    } as unknown as AuthContext["supabase"];

    const uninitializedApp = createApp({
      tokenVerifier: async () => ({
        userId: "user-uninit",
        email: "u@example.com",
        token: "tok",
        supabase: emptyDbClient,
      }),
    });

    const res = await request(uninitializedApp)
      .post("/api/chat/message")
      .set("Authorization", "Bearer tok")
      .send({ text: "Hello mentor", mode: "mentor", explain: "Hinglish" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.content).toBeTruthy();
    expect(res.body.data.persistenceWarning).toContain("0001_initial_schema.sql");

    const profileRes = await request(uninitializedApp)
      .get("/api/profile")
      .set("Authorization", "Bearer tok");
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.learning_language).toBe("English");

    const mistakesRes = await request(uninitializedApp)
      .get("/api/mistakes")
      .set("Authorization", "Bearer tok");
    expect(mistakesRes.status).toBe(200);
    expect(mistakesRes.body.data).toEqual([]);

    const submitPracticeRes = await request(uninitializedApp)
      .post("/api/practice/submit")
      .set("Authorization", "Bearer tok")
      .send({ results: [{ concept: "Tenses", correct: true }] });
    expect(submitPracticeRes.status).toBe(200);
    expect(submitPracticeRes.body.data.updatedCount).toBe(0);
  });

  it("generates fresh Gemini practice questions forwarding topic and excludeQuestions", async () => {
    const res = await request(app)
      .post("/api/practice/generate")
      .set("Authorization", "Bearer valid-token-a")
      .send({
        category: "grammar",
        count: 3,
        topic: "Tenses",
        excludeQuestions: ["Old question 1"],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.generatedBy).toBe("gemini");
    expect(res.body.data.questions[0].question).toContain("Tenses");
  });

  it("serves 0001_initial_schema.sql for authenticated one-click copy setup", async () => {
    const res = await request(app)
      .get("/api/profile/schema-sql")
      .set("Authorization", "Bearer valid-token-a");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.filename).toContain("0001_initial_schema.sql");
    expect(res.body.data.sql).toContain("CREATE TABLE IF NOT EXISTS public.learning_sessions");
  });

  it("uses sanitized client history fallback so mentor resumes seamlessly even before DB tables exist", async () => {
    const pgrst205Error = {
      code: "PGRST205",
      message: "Could not find the table 'public.profiles' in the schema cache",
    };
    const emptyDbClient = {
      from: () => {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: null, error: pgrst205Error }),
        };
        return q;
      },
    } as unknown as AuthContext["supabase"];

    const statelessApp = createApp({
      tokenVerifier: async () => ({
        userId: "user-stateless",
        email: "s@example.com",
        token: "tok",
        supabase: emptyDbClient,
      }),
    });

    const { orchestrateChatTurn } = await import("../../backend/src/services/ai/aiOrchestrator");
    const mockOrchestrator = vi.mocked(orchestrateChatTurn);
    mockOrchestrator.mockClear();

    const res = await request(statelessApp)
      .post("/api/chat/message")
      .set("Authorization", "Bearer tok")
      .send({
        text: "Now ask me the second question.",
        mode: "mentor",
        explain: "Hinglish",
        history: [
          { role: "user", content: "I am preparing for an interview." },
          { role: "assistant", content: "Great! Let us practise introducing yourself." },
        ],
      });

    expect(res.status).toBe(200);
    expect(mockOrchestrator).toHaveBeenCalledTimes(1);
    const callArg = mockOrchestrator.mock.calls[0]?.[0];
    expect(callArg?.memory.recentMessages).toEqual([
      { role: "user", content: "I am preparing for an interview." },
      { role: "assistant", content: "Great! Let us practise introducing yourself." },
    ]);
  });
});

