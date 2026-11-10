import type { SupabaseClient } from "@supabase/supabase-js";

export interface WeeklyAnalytics {
  periodStart: string;
  periodEnd: string;
  totalMessages: number;
  userMessages: number;
  assistantReplies: number;
  accuracyPercent: number | null;
  sessionsCount: number;
  dailyBreakdown: Array<{
    date: string;
    day: string;
    messages: number;
    accuracy: number | null;
  }>;
  topConcepts: Array<{
    concept: string;
    errors: number;
  }>;
  dueForReviewCount: number;
  dueTimeCapsulesCount: number;
}

export async function buildWeeklyReportData(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<WeeklyAnalytics> {
  const periodEnd = new Date(now);
  const periodStart = new Date(now.getTime() - 6 * 86_400_000);
  periodStart.setHours(0, 0, 0, 0);

  const [msgsRes, mistakesRes, sessionsRes, dueConceptsRes, dueCapsulesRes] = await Promise.all([
    supabase
      .from("messages")
      .select("role, mode, corrections, created_at")
      .eq("user_id", userId)
      .gte("created_at", periodStart.toISOString())
      .order("created_at", { ascending: true }),
    supabase
      .from("mistakes")
      .select("concept, created_at")
      .eq("user_id", userId)
      .gte("created_at", periodStart.toISOString()),
    supabase
      .from("learning_sessions")
      .select("id")
      .eq("user_id", userId)
      .gte("started_at", periodStart.toISOString()),
    supabase
      .from("learner_concepts")
      .select("id")
      .eq("user_id", userId)
      .lte("next_review_at", now.toISOString()),
    supabase
      .from("time_capsules")
      .select("id")
      .eq("user_id", userId)
      .is("opened_at", null)
      .lte("reminder_at", now.toISOString()),
  ]);

  const msgs = (msgsRes.data ?? []) as Array<{
    role: string;
    mode: string;
    corrections: unknown;
    created_at: string;
  }>;
  const mistakes = (mistakesRes.data ?? []) as Array<{ concept: string; created_at: string }>;

  const toDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const dailyBreakdown: WeeklyAnalytics["dailyBreakdown"] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = toDayKey(d);
    const dayMsgs = msgs.filter((m) => toDayKey(new Date(m.created_at)) === key);
    const userDayMsgs = dayMsgs.filter((m) => m.role === "user");
    const tutorReplies = dayMsgs.filter((m) => m.role === "assistant" && m.mode !== "mentor");
    const cleanReplies = tutorReplies.filter(
      (m) => !Array.isArray(m.corrections) || m.corrections.length === 0,
    );

    dailyBreakdown.push({
      date: key,
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      messages: userDayMsgs.length,
      accuracy: tutorReplies.length ? Math.round((cleanReplies.length / tutorReplies.length) * 100) : null,
    });
  }

  const userMessages = msgs.filter((m) => m.role === "user").length;
  const tutorReplies = msgs.filter((m) => m.role === "assistant" && m.mode !== "mentor");
  const cleanTotal = tutorReplies.filter(
    (m) => !Array.isArray(m.corrections) || m.corrections.length === 0,
  ).length;

  const conceptCounts = new Map<string, number>();
  for (const m of mistakes) {
    conceptCounts.set(m.concept, (conceptCounts.get(m.concept) ?? 0) + 1);
  }
  const topConcepts = [...conceptCounts.entries()]
    .map(([concept, errors]) => ({ concept, errors }))
    .sort((a, b) => b.errors - a.errors)
    .slice(0, 6);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalMessages: msgs.length,
    userMessages,
    assistantReplies: tutorReplies.length,
    accuracyPercent: tutorReplies.length ? Math.round((cleanTotal / tutorReplies.length) * 100) : null,
    sessionsCount: (sessionsRes.data ?? []).length,
    dailyBreakdown,
    topConcepts,
    dueForReviewCount: (dueConceptsRes.data ?? []).length,
    dueTimeCapsulesCount: (dueCapsulesRes.data ?? []).length,
  };
}

