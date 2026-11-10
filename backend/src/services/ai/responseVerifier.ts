import { z } from "zod";
import type { InnerCouncilResult, PracticeQuestion, SessionReview } from "../../types";
import { scanAndSanitizeText } from "../safety/safetyFilter";

const CorrectionZod = z.object({
  original: z.string().trim().min(1).max(500),
  corrected: z.string().trim().min(1).max(500),
  explanation: z.string().trim().min(1).max(800),
  root_cause: z.string().trim().min(1).max(200),
  concept: z.string().trim().min(1).max(100),
  category: z
    .enum(["grammar", "vocabulary", "spelling", "pronunciation", "syntax", "other"])
    .default("grammar"),
});

const MemoryCandidateZod = z.object({
  concept: z.string().trim().min(1).max(100),
  status: z.enum(["known", "weak", "unknown"]),
  confidence: z.number().finite(),
  confusionNote: z.string().trim().max(300).optional(),
});

const ConstantNoteCandidateZod = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(800),
  tag: z.string().trim().min(1).max(60).default("General"),
});

export const InnerCouncilResponseZod = z.object({
  reply: z.string().trim().min(1).max(2500),
  joSahiTha: z.string().trim().max(500).default("You expressed your thought clearly."),
  corrections: z.array(CorrectionZod).default([]),
  nextQuestion: z.string().trim().max(500).default(""),
  memoryCandidates: z.array(MemoryCandidateZod).max(4).default([]),
  constantNoteCandidate: ConstantNoteCandidateZod.nullable().optional(),
  councilNotes: z
    .object({
      criticSummary: z.string().trim().max(500).default(""),
      skepticVerified: z.boolean().default(true),
    })
    .default({ criticSummary: "", skepticVerified: true }),
});

export const SessionReviewZod = z.object({
  summary: z.string().trim().min(1).max(1500),
  mistakeReview: z.array(z.string().trim().min(1).max(400)).max(8).default([]),
  homework: z.string().trim().min(1).max(800),
  nextSessionGuidance: z.string().trim().min(1).max(800),
  constantNote: ConstantNoteCandidateZod.nullable().optional(),
});

export const PracticeQuestionZod = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  question: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1).max(600),
  concept: z.string().trim().min(1).max(100),
});

export const PracticeSetZod = z.object({
  questions: z.array(PracticeQuestionZod).min(1).max(10),
});

/**
 * Verifies, deduplicates, enforces correction policy (max 2 unless full correction requested),
 * removes false-positive corrections where original == corrected, and strips any sensitive PII.
 */
export function verifyInnerCouncilOutput(
  raw: unknown,
  opts: { allowFullCorrection?: boolean } = {},
): InnerCouncilResult {
  const parsed = InnerCouncilResponseZod.parse(raw);

  const maxCorrections = opts.allowFullCorrection ? 5 : 2;
  const seenPairs = new Set<string>();
  const verifiedCorrections = parsed.corrections
    .filter((c) => {
      const normOrig = c.original.trim().toLowerCase();
      const normCorr = c.corrected.trim().toLowerCase();
      if (!normOrig || !normCorr || normOrig === normCorr) return false;
      const key = `${normOrig}::${normCorr}`;
      if (seenPairs.has(key)) return false;
      seenPairs.add(key);
      return true;
    })
    .slice(0, maxCorrections)
    .map((c) => ({
      original: scanAndSanitizeText(c.original).sanitizedText,
      corrected: scanAndSanitizeText(c.corrected).sanitizedText,
      explanation: scanAndSanitizeText(c.explanation).sanitizedText,
      root_cause: scanAndSanitizeText(c.root_cause).sanitizedText,
      concept: c.concept.trim(),
      category: c.category,
    }));

  const safeMemoryCandidates = parsed.memoryCandidates
    .map((mc) => ({
      concept: mc.concept.trim(),
      status: mc.status,
      confidence: Math.max(0.05, Math.min(0.99, Number(mc.confidence.toFixed(2)))),
      ...(mc.confusionNote ? { confusionNote: scanAndSanitizeText(mc.confusionNote).sanitizedText } : {}),
    }))
    .filter((mc) => mc.concept.length >= 2);

  const safeNote = parsed.constantNoteCandidate
    ? {
        title: scanAndSanitizeText(parsed.constantNoteCandidate.title).sanitizedText,
        content: scanAndSanitizeText(parsed.constantNoteCandidate.content).sanitizedText,
        tag: parsed.constantNoteCandidate.tag.trim() || "General",
      }
    : null;

  return {
    reply: scanAndSanitizeText(parsed.reply).sanitizedText,
    joSahiTha: scanAndSanitizeText(parsed.joSahiTha).sanitizedText,
    corrections: verifiedCorrections,
    nextQuestion: scanAndSanitizeText(parsed.nextQuestion).sanitizedText,
    memoryCandidates: safeMemoryCandidates,
    constantNoteCandidate: safeNote,
    councilNotes: {
      criticSummary: parsed.councilNotes.criticSummary,
      skepticVerified: parsed.councilNotes.skepticVerified,
    },
  };
}

export function verifySessionReviewOutput(raw: unknown): SessionReview {
  const parsed = SessionReviewZod.parse(raw);
  return {
    summary: scanAndSanitizeText(parsed.summary).sanitizedText,
    mistakeReview: parsed.mistakeReview.map((item) => scanAndSanitizeText(item).sanitizedText),
    homework: scanAndSanitizeText(parsed.homework).sanitizedText,
    nextSessionGuidance: scanAndSanitizeText(parsed.nextSessionGuidance).sanitizedText,
    constantNote: parsed.constantNote
      ? {
          title: scanAndSanitizeText(parsed.constantNote.title).sanitizedText,
          content: scanAndSanitizeText(parsed.constantNote.content).sanitizedText,
          tag: parsed.constantNote.tag.trim() || "Session Takeaway",
        }
      : null,
  };
}

export function verifyPracticeSetOutput(raw: unknown): PracticeQuestion[] {
  const parsed = PracticeSetZod.parse(raw);
  const batchSeed = Date.now().toString(36);
  return parsed.questions.map((q, idx) => ({
    id: q.id || `q-${batchSeed}-${idx + 1}`,
    question: q.question,
    options: q.options,
    correctIndex: Math.min(q.correctIndex, q.options.length - 1),
    explanation: q.explanation,
    concept: q.concept,
  }));
}

