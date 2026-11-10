import { describe, expect, it } from "vitest";
import { buildChatPrompt, buildMentorVoicePrompt } from "../../backend/src/services/prompts/promptBuilder";

describe("promptBuilder", () => {
  it("includes learner profile, mode instructions, and bounded memory", () => {
    const result = buildChatPrompt({
      profile: {
        full_name: "Aarav Sharma",
        native_language: "Hindi",
        learning_language: "English",
        level: "Beginner",
        goal: "Job interviews",
      },
      mode: "learn",
      explainLanguage: "Hinglish",
      learnerMessage: "I am go to office daily.",
      memory: {
        weakConcepts: [{ concept: "Present Simple", status: "weak", confidence: 0.4 }],
        topMistakePatterns: [
          { pattern_key: "Present Simple — mixing am", root_cause: "Auxiliary verb confusion", occurrence_count: 3 },
        ],
        relevantNotes: [{ title: "Habit verbs", content: "Use base verb without am", tag: "Grammar" }],
        recentMessages: [{ role: "user", content: "Hi tutor" }],
      },
    });

    expect(result.systemInstruction).toContain("Aarav");
    expect(result.systemInstruction).toContain("Hinglish");
    expect(result.systemInstruction).toContain("Present Simple");
    expect(result.systemInstruction).toContain("AT MOST 2");
    expect(result.userPrompt).toContain("I am go to office daily.");
    expect(result.userPrompt).toContain("Learner: Hi tutor");
  });

  it("builds a concise spoken-style prompt for live voice mentor turns", () => {
    const prompt = buildMentorVoicePrompt({
      profile: {
        full_name: "Priya",
        learning_language: "English",
        level: "Intermediate",
        goal: "Fluency at work",
      },
      explainLanguage: "Hinglish",
      learnerMessage: "Yesterday I go to office and felt nervous.",
      recentMessages: [{ role: "assistant", content: "Hi Priya! How are you feeling today?" }],
    });

    expect(prompt.systemInstruction).toContain("Priya");
    expect(prompt.systemInstruction).toContain("25-50 words");
    expect(prompt.userPrompt).toContain("Yesterday I go to office and felt nervous.");
    expect(prompt.userPrompt).toContain("Mentor: Hi Priya!");
  });
});

