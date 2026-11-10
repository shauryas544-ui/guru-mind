// Real learner stats computed only from the user's own tutor messages and saved mistakes.
export type StatMessage = {
  role: string;
  mode?: string;
  created_at: string;
  corrections?: unknown;
};
export type StatMistake = {
  concept: string;
  root_cause: string;
  original: string;
  corrected: string;
  explanation?: string | null;
  created_at: string;
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function computeStreak(messages: StatMessage[], now = new Date()): number {
  const days = new Set(
    messages.filter((m) => m.role === "user").map((m) => dayKey(new Date(m.created_at))),
  );
  const d = new Date(now);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function hasCorrections(m: StatMessage) {
  return Array.isArray(m.corrections) && m.corrections.length > 0;
}

/** % of tutor replies with no corrections; null when there are no replies yet. */
export function computeAccuracy(messages: StatMessage[]): number | null {
  const replies = messages.filter((m) => m.role === "assistant" && m.mode !== "mentor");
  if (!replies.length) return null;
  return Math.round((replies.filter((m) => !hasCorrections(m)).length / replies.length) * 100);
}

export type ConceptStat = {
  name: string;
  errors: number;
  last: string;
  status: "Needs work" | "Improving";
};
export function computeConcepts(mistakes: StatMistake[]): ConceptStat[] {
  const map = new Map<string, ConceptStat>();
  for (const m of mistakes) {
    const c = map.get(m.concept) ?? {
      name: m.concept,
      errors: 0,
      last: m.created_at,
      status: "Improving" as const,
    };
    c.errors++;
    if (m.created_at > c.last) c.last = m.created_at;
    map.set(m.concept, c);
  }
  return [...map.values()]
    .map((c) => ({ ...c, status: c.errors >= 3 ? "Needs work" : "Improving" }) as ConceptStat)
    .sort((a, b) => b.errors - a.errors);
}

export function computeWeek(messages: StatMessage[], now = new Date()) {
  const out: { day: string; messages: number; accuracy: number | null }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    const same = messages.filter((m) => dayKey(new Date(m.created_at)) === k);
    out.push({
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      messages: same.filter((m) => m.role === "user").length,
      accuracy: computeAccuracy(same),
    });
  }
  return out;
}
