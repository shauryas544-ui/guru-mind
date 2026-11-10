import { describe, expect, it } from "vitest";
import { verifyInnerCouncilOutput } from "../../backend/src/services/ai/responseVerifier";

describe("responseVerifier", () => {
  it("caps corrections at 2 by default and strips identical false-positive corrections", () => {
    const verified = verifyInnerCouncilOutput({
      reply: "Good effort! Keep practising routine sentences.",
      joSahiTha: "Subject and object placement was right.",
      corrections: [
        {
          original: "I go to market.",
          corrected: "I go to market.",
          explanation: "Same sentence",
          root_cause: "None",
          concept: "Present Simple",
          category: "grammar",
        },
        {
          original: "I am go daily.",
          corrected: "I go daily.",
          explanation: "Drop 'am' for routines.",
          root_cause: "Auxiliary confusion",
          concept: "Present Simple",
          category: "grammar",
        },
        {
          original: "He is engineer.",
          corrected: "He is an engineer.",
          explanation: "Use 'an' before vowel sound.",
          root_cause: "Missing article",
          concept: "Articles",
          category: "grammar",
        },
        {
          original: "Yesterday I eat rice.",
          corrected: "Yesterday I ate rice.",
          explanation: "Use past tense for yesterday.",
          root_cause: "Base verb in past",
          concept: "Past Simple",
          category: "grammar",
        },
      ],
      nextQuestion: "Can you write one sentence about your morning?",
      memoryCandidates: [
        { concept: "Present Simple", status: "weak", confidence: 1.4 },
      ],
    });

    expect(verified.corrections).toHaveLength(2);
    expect(verified.corrections[0].original).toBe("I am go daily.");
    expect(verified.corrections[1].original).toBe("He is engineer.");
    expect(verified.memoryCandidates[0].confidence).toBeLessThanOrEqual(0.99);
  });

  it("throws on invalid schema payloads", () => {
    expect(() => verifyInnerCouncilOutput({ invalid: true })).toThrow();
  });
});

