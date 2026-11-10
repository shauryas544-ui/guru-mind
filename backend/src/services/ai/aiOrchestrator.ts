import { z } from "zod";
import { env } from "../../config/environment";
import type {
  ExplainLanguage,
  InnerCouncilResult,
  LearnMode,
  PracticeQuestion,
  SessionReview,
  UserProfile,
} from "../../types";
import {
  buildChatPrompt,
  buildMentorVoicePrompt,
  type PromptMemoryContext,
} from "../prompts/promptBuilder";
import { GeminiSchemaType, generateGeminiJson, type GeminiSchema } from "./geminiProvider";
import {
  verifyInnerCouncilOutput,
  verifyPracticeSetOutput,
  verifySessionReviewOutput,
} from "./responseVerifier";

const INNER_COUNCIL_SCHEMA: GeminiSchema = {
  type: GeminiSchemaType.OBJECT,
  properties: {
    reply: { type: GeminiSchemaType.STRING },
    joSahiTha: { type: GeminiSchemaType.STRING },
    corrections: {
      type: GeminiSchemaType.ARRAY,
      items: {
        type: GeminiSchemaType.OBJECT,
        properties: {
          original: { type: GeminiSchemaType.STRING },
          corrected: { type: GeminiSchemaType.STRING },
          explanation: { type: GeminiSchemaType.STRING },
          root_cause: { type: GeminiSchemaType.STRING },
          concept: { type: GeminiSchemaType.STRING },
          category: {
            type: GeminiSchemaType.STRING,
            enum: ["grammar", "vocabulary", "spelling", "pronunciation", "syntax", "other"],
          },
        },
        required: ["original", "corrected", "explanation", "root_cause", "concept", "category"],
      },
    },
    nextQuestion: { type: GeminiSchemaType.STRING },
    memoryCandidates: {
      type: GeminiSchemaType.ARRAY,
      items: {
        type: GeminiSchemaType.OBJECT,
        properties: {
          concept: { type: GeminiSchemaType.STRING },
          status: { type: GeminiSchemaType.STRING, enum: ["known", "weak", "unknown"] },
          confidence: { type: GeminiSchemaType.NUMBER },
          confusionNote: { type: GeminiSchemaType.STRING },
        },
        required: ["concept", "status", "confidence"],
      },
    },
    constantNoteCandidate: {
      type: GeminiSchemaType.OBJECT,
      nullable: true,
      properties: {
        title: { type: GeminiSchemaType.STRING },
        content: { type: GeminiSchemaType.STRING },
        tag: { type: GeminiSchemaType.STRING },
      },
      required: ["title", "content", "tag"],
    },
    councilNotes: {
      type: GeminiSchemaType.OBJECT,
      properties: {
        criticSummary: { type: GeminiSchemaType.STRING },
        skepticVerified: { type: GeminiSchemaType.BOOLEAN },
      },
      required: ["criticSummary", "skepticVerified"],
    },
  },
  required: ["reply", "joSahiTha", "corrections", "nextQuestion", "memoryCandidates", "councilNotes"],
};

const SKEPTIC_AUDIT_SCHEMA: GeminiSchema = {
  type: GeminiSchemaType.OBJECT,
  properties: {
    approvedIndices: {
      type: GeminiSchemaType.ARRAY,
      items: { type: GeminiSchemaType.INTEGER },
    },
    auditNote: { type: GeminiSchemaType.STRING },
  },
  required: ["approvedIndices", "auditNote"],
};

const SESSION_REVIEW_SCHEMA: GeminiSchema = {
  type: GeminiSchemaType.OBJECT,
  properties: {
    summary: { type: GeminiSchemaType.STRING },
    mistakeReview: {
      type: GeminiSchemaType.ARRAY,
      items: { type: GeminiSchemaType.STRING },
    },
    homework: { type: GeminiSchemaType.STRING },
    nextSessionGuidance: { type: GeminiSchemaType.STRING },
    constantNote: {
      type: GeminiSchemaType.OBJECT,
      nullable: true,
      properties: {
        title: { type: GeminiSchemaType.STRING },
        content: { type: GeminiSchemaType.STRING },
        tag: { type: GeminiSchemaType.STRING },
      },
      required: ["title", "content", "tag"],
    },
  },
  required: ["summary", "mistakeReview", "homework", "nextSessionGuidance"],
};

const PRACTICE_SCHEMA: GeminiSchema = {
  type: GeminiSchemaType.OBJECT,
  properties: {
    questions: {
      type: GeminiSchemaType.ARRAY,
      items: {
        type: GeminiSchemaType.OBJECT,
        properties: {
          question: { type: GeminiSchemaType.STRING },
          options: { type: GeminiSchemaType.ARRAY, items: { type: GeminiSchemaType.STRING } },
          correctIndex: { type: GeminiSchemaType.INTEGER },
          explanation: { type: GeminiSchemaType.STRING },
          concept: { type: GeminiSchemaType.STRING },
        },
        required: ["question", "options", "correctIndex", "explanation", "concept"],
      },
    },
  },
  required: ["questions"],
};

const MENTOR_VOICE_SCHEMA: GeminiSchema = {
  type: GeminiSchemaType.OBJECT,
  properties: {
    reply: { type: GeminiSchemaType.STRING },
    joSahiTha: { type: GeminiSchemaType.STRING },
    nextQuestion: { type: GeminiSchemaType.STRING },
    correction: {
      type: GeminiSchemaType.OBJECT,
      nullable: true,
      properties: {
        original: { type: GeminiSchemaType.STRING },
        corrected: { type: GeminiSchemaType.STRING },
        explanation: { type: GeminiSchemaType.STRING },
        concept: { type: GeminiSchemaType.STRING },
      },
      required: ["original", "corrected", "explanation", "concept"],
    },
  },
  required: ["reply", "joSahiTha", "nextQuestion"],
};

interface MentorVoiceRawOutput {
  reply: string;
  joSahiTha?: string;
  nextQuestion?: string;
  correction?: {
    original: string;
    corrected: string;
    explanation: string;
    concept: string;
  } | null;
}

/**
 * Coordinates the Guru Mind Inner Council (Tutor, Mentor, Critic, Skeptic, Response Composer)
 * via Gemini AI and validates outputs before returning to the controller.
 */
export async function orchestrateChatTurn(params: {
  profile: Partial<UserProfile>;
  mode: LearnMode;
  explainLanguage: ExplainLanguage;
  learnerMessage: string;
  memory: PromptMemoryContext;
}): Promise<InnerCouncilResult> {
  if (params.mode === "mentor") {
    const { systemInstruction, userPrompt } = buildMentorVoicePrompt({
      profile: params.profile,
      explainLanguage: params.explainLanguage,
      learnerMessage: params.learnerMessage,
      recentMessages: params.memory.recentMessages,
    });

    const fastRaw = await generateGeminiJson<MentorVoiceRawOutput>({
      systemInstruction,
      userPrompt,
      responseSchema: MENTOR_VOICE_SCHEMA,
      temperature: 0.7,
      maxOutputTokens: 320,
      timeoutMs: 8500,
      hedgeDelayMs: 2200,
    });

    return verifyInnerCouncilOutput(
      {
        reply: fastRaw.reply,
        joSahiTha: fastRaw.joSahiTha || "You shared your thought naturally.",
        corrections: fastRaw.correction
          ? [
              {
                ...fastRaw.correction,
                root_cause: "Spoken phrasing polish",
                category: "grammar",
              },
            ]
          : [],
        nextQuestion: fastRaw.nextQuestion || "",
        memoryCandidates: [],
        constantNoteCandidate: null,
        councilNotes: {
          criticSummary: "Live voice mentor turn",
          skepticVerified: true,
        },
      },
      { allowFullCorrection: false },
    );
  }

  const allowFullCorrection = /\b(correct everything|full correction|all mistakes|check every)\b/i.test(
    params.learnerMessage,
  );

  const { systemInstruction, userPrompt } = buildChatPrompt({
    profile: params.profile,
    mode: params.mode,
    explainLanguage: params.explainLanguage,
    learnerMessage: params.learnerMessage,
    memory: params.memory,
    allowFullCorrection,
  });

  const rawResult = await generateGeminiJson<unknown>({
    systemInstruction,
    userPrompt,
    responseSchema: INNER_COUNCIL_SCHEMA,
    temperature: 0.45,
    maxOutputTokens: 1000,
    timeoutMs: 14_000,
    hedgeDelayMs: 3200,
  });

  const verified = verifyInnerCouncilOutput(rawResult, { allowFullCorrection });

  // Optional second-pass Skeptic verification when explicitly enabled
  if (env.enableSkepticSecondPass && verified.corrections.length > 0) {
    try {
      const audit = await generateGeminiJson<{ approvedIndices: number[]; auditNote: string }>({
        systemInstruction:
          "You are the Skeptic Agent. Verify whether each proposed language correction is genuinely warranted and accurate. Return approvedIndices (0-based) for valid corrections only.",
        userPrompt: JSON.stringify({
          learnerMessage: params.learnerMessage,
          proposedCorrections: verified.corrections,
        }),
        responseSchema: SKEPTIC_AUDIT_SCHEMA,
        temperature: 0.1,
      });

      const auditParsed = z
        .object({ approvedIndices: z.array(z.number().int()), auditNote: z.string() })
        .parse(audit);

      const allowed = new Set(auditParsed.approvedIndices);
      verified.corrections = verified.corrections.filter((_, idx) => allowed.has(idx));
      verified.councilNotes = {
        criticSummary: auditParsed.auditNote || verified.councilNotes.criticSummary,
        skepticVerified: true,
      };
    } catch {
      // Do not fail the learner turn if optional second pass errors; deterministic verification already ran.
    }
  }

  return verified;
}

export async function generateEndOfSessionReview(params: {
  profile: Partial<UserProfile>;
  mode: LearnMode;
  explainLanguage: ExplainLanguage;
  messages: Array<{ role: string; content: string }>;
  mistakes: Array<{ original_text: string; corrected_text: string; concept: string; root_cause: string }>;
}): Promise<SessionReview> {
  const targetLang = params.profile.learning_language || "English";
  const level = params.profile.level || "Beginner";

  const transcript = params.messages
    .slice(-24)
    .map((m) => `${m.role === "user" ? "Learner" : "Guru Mind"}: ${m.content}`)
    .join("\n");

  const mistakesText = params.mistakes.length
    ? params.mistakes
        .map((m) => `- "${m.original_text}" -> "${m.corrected_text}" (${m.concept}: ${m.root_cause})`)
        .join("\n")
    : "- No mistakes recorded in this session.";

  const raw = await generateGeminiJson<unknown>({
    systemInstruction: `You are Guru Mind producing an End-of-Session Review for a ${level} ${targetLang} learner. Write clearly in ${params.explainLanguage} (keeping target language examples in ${targetLang}). Be encouraging, concrete, and actionable.`,
    userPrompt: `Session mode: ${params.mode}\n\nTranscript:\n${transcript || "(Short session)"}\n\nSession mistakes:\n${mistakesText}\n\nGenerate a structured end-of-session review with summary, mistakeReview bullets, practical homework, nextSessionGuidance, and an optional constantNote takeaway.`,
    responseSchema: SESSION_REVIEW_SCHEMA,
    temperature: 0.4,
    maxOutputTokens: 1200,
    timeoutMs: 14_000,
  });

  return verifySessionReviewOutput(raw);
}

const CATEGORY_GUIDE: Record<string, string> = {
  grammar: "verb tenses, subject-verb agreement, prepositions, articles, modals, and conditionals",
  vocab: "natural word choice, collocations, phrasal verbs, idioms, and context vocabulary",
  speaking: "natural sentence building, polite spoken responses, conversation flow, and everyday expressions",
  writing: "error spotting, sentence correction, punctuation, word order, and clear written phrasing",
};

export async function generateAdaptivePracticeQuestions(params: {
  profile: Partial<UserProfile>;
  category: string;
  count: number;
  weakConcepts: Array<{ concept: string; error_count: number }>;
  patterns: Array<{ pattern_key: string; root_cause: string }>;
  topic?: string;
  excludeQuestions?: string[];
}): Promise<PracticeQuestion[]> {
  const targetLang = params.profile.learning_language || "English";
  const nativeLang = params.profile.native_language || "Hindi";
  const level = params.profile.level || "Beginner";
  const explainLang = params.profile.explain_language || "Hinglish";

  const focusList = [
    ...params.weakConcepts.map((c) => `${c.concept} (${c.error_count} mistakes)`),
    ...params.patterns.map((p) => `${p.pattern_key}: ${p.root_cause}`),
  ]
    .slice(0, 6)
    .join("; ");

  const excludeBlock = params.excludeQuestions?.length
    ? `\nDo NOT repeat or closely paraphrase any of these previously asked questions:\n${params.excludeQuestions
        .slice(-15)
        .map((q, idx) => `${idx + 1}. ${q}`)
        .join("\n")}`
    : "";

  const topicLine = params.topic?.trim()
    ? `Specific requested topic: "${params.topic.trim()}". All ${params.count} questions must focus directly on this topic.`
    : `Category skill focus: ${CATEGORY_GUIDE[params.category] ?? params.category}.`;

  const raw = await generateGeminiJson<unknown>({
    systemInstruction: `You are Guru Mind's Gemini Practice Generator creating ${params.count} fresh, non-repetitive multiple-choice questions for a ${level} ${targetLang} learner (native language: ${nativeLang}). Write question prompts and 4 realistic options in ${targetLang}, and clear explanations in ${explainLang}. Always vary real-life contexts (work, travel, tech, friends, interviews, daily life) and avoid textbook clichés.`,
    userPrompt: `Category: ${params.category}\n${topicLine}\nTarget count: ${params.count}\nFreshness token: ${Date.now()}\nLearner weak areas: ${focusList || "Mix of useful everyday communication patterns"}${excludeBlock}\n\nGenerate ${params.count} unique, practical MCQs with exactly 4 distinct options each and a 0-based correctIndex (0..3).`,
    responseSchema: PRACTICE_SCHEMA,
    temperature: 0.85,
    maxOutputTokens: 1600,
    timeoutMs: 14_000,
    hedgeDelayMs: 3200,
  });

  return verifyPracticeSetOutput(raw).slice(0, params.count);
}

