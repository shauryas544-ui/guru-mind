import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../backend/src/app";
import type { AuthContext } from "../../backend/src/types";

describe("Security & cross-user isolation", () => {
  const dbRows: Array<{ id: string; user_id: string; mode: string; language: string; title: string }> = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "user-b",
      mode: "learn",
      language: "English",
      title: "User B private session",
    },
  ];

  function scopedClient(userId: string): AuthContext["supabase"] {
    const makeQuery = () => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [
        (row) => row.user_id === userId, // simulates PostgreSQL RLS enforcement
      ];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filters.push((row) => row[col] === val);
          return q;
        },
        order: () => q,
        maybeSingle: async () => ({
          data: dbRows.find((r) => filters.every((fn) => fn(r as unknown as Record<string, unknown>))) ?? null,
          error: null,
        }),
        then: (resolve: (res: { data: unknown[]; error: null }) => void) => {
          resolve({
            data: dbRows.filter((r) => filters.every((fn) => fn(r as unknown as Record<string, unknown>))),
            error: null,
          });
        },
      };
      return q;
    };

    return { from: () => makeQuery() } as unknown as AuthContext["supabase"];
  }

  const app = createApp({
    tokenVerifier: async (token) => {
      if (token === "token-user-a") {
        return { userId: "user-a", email: "a@test.com", token, supabase: scopedClient("user-a") };
      }
      throw new Error("Unauthorized");
    },
  });

  it("prevents User A from reading User B's learning session", async () => {
    const res = await request(app)
      .get("/api/sessions/11111111-1111-4111-8111-111111111111")
      .set("Authorization", "Bearer token-user-a");

    expect(res.status).toBe(404);
  });

  it("rejects body userId spoofing with 403 Forbidden", async () => {
    const res = await request(app)
      .post("/api/memory/notes")
      .set("Authorization", "Bearer token-user-a")
      .send({ user_id: "user-b", title: "Fake", content: "Spoof attempt", tag: "Test" });

    expect(res.status).toBe(403);
  });

  it("enables Row Level Security on every user-owned table in policies.sql", () => {
    const policiesSql = fs.readFileSync(path.resolve(process.cwd(), "database/policies.sql"), "utf8");
    const requiredTables = [
      "profiles",
      "learning_sessions",
      "messages",
      "constant_notes",
      "learner_concepts",
      "mistakes",
      "mistake_patterns",
      "memory_cards",
      "time_capsules",
      "reports",
    ];

    for (const table of requiredTables) {
      expect(policiesSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(policiesSql).toContain(`auth.uid()`);
    }
  });
});

