import { describe, it, expect } from "vitest";
import { computeStreak, computeAccuracy, computeConcepts } from "./learner-stats";

const at = (daysAgo: number) => {
  const d = new Date("2026-10-30T10:00:00");
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};
const now = new Date("2026-10-30T12:00:00");

describe("learner stats", () => {
  it("streak is zero with no activity", () => expect(computeStreak([], now)).toBe(0));
  it("counts consecutive days", () => {
    expect(
      computeStreak(
        [0, 1, 2, 4].map((d) => ({ role: "user", created_at: at(d) })),
        now,
      ),
    ).toBe(3);
  });
  it("accuracy is null with no replies", () => expect(computeAccuracy([])).toBeNull());
  it("accuracy = replies without corrections", () => {
    expect(
      computeAccuracy([
        { role: "assistant", created_at: at(0), corrections: [] },
        { role: "assistant", created_at: at(0), corrections: [{}] },
      ]),
    ).toBe(50);
  });
  it("concept with 3+ errors needs work", () => {
    const m = { root_cause: "", original: "", corrected: "", created_at: at(0) };
    const c = computeConcepts([
      { ...m, concept: "A" },
      { ...m, concept: "A" },
      { ...m, concept: "A" },
      { ...m, concept: "B" },
    ]);
    expect(c[0]).toMatchObject({ name: "A", errors: 3, status: "Needs work" });
    expect(c[1]).toMatchObject({ name: "B", status: "Improving" });
  });
});
