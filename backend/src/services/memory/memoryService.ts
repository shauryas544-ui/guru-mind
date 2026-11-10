import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConstantNoteCandidate,
  CorrectionItem,
  LearnMode,
  MemoryCandidate,
} from "../../types";
import type { PromptMemoryContext } from "../prompts/promptBuilder";
import { isEducationalMemorySafe, scanAndSanitizeText } from "../safety/safetyFilter";
import { logger } from "../../utils/logger";

export async function retrievePromptMemory(
  supabase: SupabaseClient,
  params: {
    userId: string;
    sessionId: string;
    language: string;
    mode: LearnMode;
  },
): Promise<PromptMemoryContext> {
  const messagesQuery =
    params.mode === "mentor"
      ? supabase
          .from("messages")
          .select("role, content")
          .eq("user_id", params.userId)
          .eq("mode", "mentor")
          .order("created_at", { ascending: false })
          .limit(14)
      : supabase
          .from("messages")
          .select("role, content")
          .eq("user_id", params.userId)
          .eq("session_id", params.sessionId)
          .order("created_at", { ascending: false })
          .limit(14);

  const [messagesRes, conceptsRes, patternsRes, notesRes] = await Promise.all([
    messagesQuery,
    supabase
      .from("learner_concepts")
      .select("concept, status, confidence, confusion_note")
      .eq("user_id", params.userId)
      .eq("language", params.language)
      .order("confidence", { ascending: true })
      .limit(6),
    supabase
      .from("mistake_patterns")
      .select("pattern_key, root_cause, occurrence_count")
      .eq("user_id", params.userId)
      .eq("language", params.language)
      .order("occurrence_count", { ascending: false })
      .limit(5),
    supabase
      .from("constant_notes")
      .select("title, content, tag")
      .eq("user_id", params.userId)
      .eq("language", params.language)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const recentMessages = ((messagesRes.data ?? []) as Array<{ role: "user" | "assistant"; content: string }>).reverse();

  return {
    weakConcepts: (conceptsRes.data ?? []) as PromptMemoryContext["weakConcepts"],
    topMistakePatterns: (patternsRes.data ?? []) as PromptMemoryContext["topMistakePatterns"],
    relevantNotes: (notesRes.data ?? []) as PromptMemoryContext["relevantNotes"],
    recentMessages,
  };
}

export function computeNextReviewTimestamp(confidence: number): string {
  const days = confidence >= 0.85 ? 14 : confidence >= 0.65 ? 5 : confidence >= 0.45 ? 2 : 1;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export async function persistValidatedMemoryUpdates(
  supabase: SupabaseClient,
  params: {
    userId: string;
    sessionId: string;
    messageId?: string;
    language: string;
    corrections: CorrectionItem[];
    memoryCandidates: MemoryCandidate[];
    constantNoteCandidate?: ConstantNoteCandidate | null;
    saveHistory: boolean;
  },
): Promise<void> {
  if (!params.saveHistory) {
    return;
  }

  // Run mistake persistence, learner-concept updates, and constant-note check concurrently
  const correctionTasks = params.corrections.map(async (correction) => {
    if (!isEducationalMemorySafe(correction.original) || !isEducationalMemorySafe(correction.corrected)) {
      logger.warn("Skipped persisting mistake containing sensitive data", { userId: params.userId });
      return;
    }

    const patternKey = `${correction.concept.trim()} — ${correction.root_cause.trim()}`.slice(0, 140);
    const [{ error: mErr }, { data: existingPattern }] = await Promise.all([
      supabase.from("mistakes").insert({
        user_id: params.userId,
        session_id: params.sessionId,
        message_id: params.messageId ?? null,
        original_text: correction.original,
        corrected_text: correction.corrected,
        explanation: correction.explanation,
        category: correction.category,
        root_cause: correction.root_cause,
        concept: correction.concept,
      }),
      supabase
        .from("mistake_patterns")
        .select("id, occurrence_count")
        .eq("user_id", params.userId)
        .eq("language", params.language)
        .eq("pattern_key", patternKey)
        .maybeSingle(),
    ]);

    if (mErr) {
      logger.warn("Failed to insert mistake record", { error: mErr.message });
    }

    if (existingPattern) {
      await supabase
        .from("mistake_patterns")
        .update({
          occurrence_count: (existingPattern.occurrence_count ?? 1) + 1,
          last_observed_at: new Date().toISOString(),
          practice_status: "active",
          example_original: correction.original,
          example_corrected: correction.corrected,
        })
        .eq("id", existingPattern.id)
        .eq("user_id", params.userId);
    } else {
      await supabase.from("mistake_patterns").insert({
        user_id: params.userId,
        language: params.language,
        pattern_key: patternKey,
        category: correction.category,
        root_cause: correction.root_cause,
        occurrence_count: 1,
        practice_status: "active",
        example_original: correction.original,
        example_corrected: correction.corrected,
      });
    }
  });

  const conceptTasks = params.memoryCandidates.map(async (candidate) => {
    const cleanConcept = scanAndSanitizeText(candidate.concept).sanitizedText.trim();
    if (!cleanConcept) return;

    const { data: existing } = await supabase
      .from("learner_concepts")
      .select("id, confidence, error_count, status")
      .eq("user_id", params.userId)
      .eq("language", params.language)
      .eq("concept", cleanConcept)
      .maybeSingle();

    const hadMistakeInConcept = params.corrections.some(
      (c) => c.concept.toLowerCase() === cleanConcept.toLowerCase(),
    );

    if (existing) {
      const prevConf = Number(existing.confidence ?? 0.5);
      // Smooth exponential moving average so a single turn nudges confidence without wiping progress
      const blendedConf = Number((prevConf * 0.65 + candidate.confidence * 0.35).toFixed(3));
      const newStatus = blendedConf >= 0.78 ? "known" : blendedConf >= 0.4 ? "weak" : "unknown";

      await supabase
        .from("learner_concepts")
        .update({
          confidence: blendedConf,
          status: newStatus,
          error_count: Number(existing.error_count ?? 0) + (hadMistakeInConcept ? 1 : 0),
          confusion_note: candidate.confusionNote ?? "",
          last_practiced: new Date().toISOString(),
          next_review_at: computeNextReviewTimestamp(blendedConf),
        })
        .eq("id", existing.id)
        .eq("user_id", params.userId);
    } else {
      const boundedConf = Number(Math.max(0.15, Math.min(0.85, candidate.confidence)).toFixed(3));
      const initStatus = boundedConf >= 0.78 ? "known" : candidate.status;

      await supabase.from("learner_concepts").insert({
        user_id: params.userId,
        language: params.language,
        concept: cleanConcept,
        status: initStatus,
        confidence: boundedConf,
        error_count: hadMistakeInConcept ? 1 : 0,
        confusion_note: candidate.confusionNote ?? "",
        last_practiced: new Date().toISOString(),
        next_review_at: computeNextReviewTimestamp(boundedConf),
      });
    }
  });

  const noteTask = (async () => {
    if (!params.constantNoteCandidate) return;
    const note = params.constantNoteCandidate;
    if (isEducationalMemorySafe(note.title) && isEducationalMemorySafe(note.content)) {
      const { data: dup } = await supabase
        .from("constant_notes")
        .select("id")
        .eq("user_id", params.userId)
        .eq("language", params.language)
        .eq("title", note.title)
        .maybeSingle();

      if (!dup) {
        await supabase.from("constant_notes").insert({
          user_id: params.userId,
          language: params.language,
          tag: note.tag,
          title: note.title,
          content: note.content,
          source_session_id: params.sessionId,
        });
      }
    }
  })();

  await Promise.all([...correctionTasks, ...conceptTasks, noteTask]);
}

export async function generateMemoryCardSnapshot(
  supabase: SupabaseClient,
  params: { userId: string; language: string },
) {
  const [profileRes, conceptsRes, patternsRes, notesRes, latestCardRes] = await Promise.all([
    supabase.from("profiles").select("full_name, level, goal, native_language").eq("id", params.userId).maybeSingle(),
    supabase
      .from("learner_concepts")
      .select("concept, status, confidence, error_count")
      .eq("user_id", params.userId)
      .eq("language", params.language)
      .order("confidence", { ascending: true })
      .limit(10),
    supabase
      .from("mistake_patterns")
      .select("pattern_key, occurrence_count, root_cause")
      .eq("user_id", params.userId)
      .eq("language", params.language)
      .order("occurrence_count", { ascending: false })
      .limit(5),
    supabase
      .from("constant_notes")
      .select("title, tag")
      .eq("user_id", params.userId)
      .eq("language", params.language)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("memory_cards")
      .select("version")
      .eq("user_id", params.userId)
      .eq("language", params.language)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const nextVersion = Number(latestCardRes.data?.version ?? 0) + 1;
  const cardContent = {
    learner: profileRes.data ?? {},
    language: params.language,
    strengths: (conceptsRes.data ?? []).filter((c) => c.status === "known").map((c) => c.concept),
    focusAreas: (conceptsRes.data ?? []).filter((c) => c.status !== "known"),
    topPatterns: patternsRes.data ?? [],
    recentNotes: notesRes.data ?? [],
    generatedAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("memory_cards")
    .insert({
      user_id: params.userId,
      language: params.language,
      version: nextVersion,
      card_content: cardContent,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function recordPracticeOutcomes(
  supabase: SupabaseClient,
  params: {
    userId: string;
    language: string;
    results: Array<{ concept: string; correct: boolean }>;
  },
): Promise<{ updatedCount: number }> {
  const grouped = new Map<string, { concept: string; outcomes: boolean[] }>();
  for (const item of params.results) {
    const cleanConcept = scanAndSanitizeText(item.concept).sanitizedText.trim();
    if (!cleanConcept || !isEducationalMemorySafe(cleanConcept)) continue;
    const key = cleanConcept.toLowerCase();
    const bucket = grouped.get(key) ?? { concept: cleanConcept, outcomes: [] };
    bucket.outcomes.push(item.correct);
    grouped.set(key, bucket);
  }

  const nowIso = new Date().toISOString();
  const counts = await Promise.all(
    Array.from(grouped.values()).map(async ({ concept, outcomes }) => {
      const { data: existing } = await supabase
        .from("learner_concepts")
        .select("id, confidence, error_count")
        .eq("user_id", params.userId)
        .eq("language", params.language)
        .eq("concept", concept)
        .maybeSingle();

      let updated = 0;
      const errorsAdded = outcomes.filter((ok) => !ok).length;

      if (existing) {
        let nextConf = Number(existing.confidence ?? 0.5);
        for (const ok of outcomes) {
          nextConf = ok
            ? Math.min(0.98, Number((nextConf + (1 - nextConf) * 0.25).toFixed(3)))
            : Math.max(0.15, Number((nextConf * 0.85).toFixed(3)));
        }
        const nextStatus = nextConf >= 0.78 ? "known" : nextConf >= 0.4 ? "weak" : "unknown";

        const { error } = await supabase
          .from("learner_concepts")
          .update({
            confidence: nextConf,
            status: nextStatus,
            error_count: Number(existing.error_count ?? 0) + errorsAdded,
            last_practiced: nowIso,
            next_review_at: computeNextReviewTimestamp(nextConf),
          })
          .eq("id", existing.id)
          .eq("user_id", params.userId);
        if (!error) updated = outcomes.length;
      } else {
        let nextConf = outcomes[0] ? 0.72 : 0.35;
        for (const ok of outcomes.slice(1)) {
          nextConf = ok
            ? Math.min(0.98, Number((nextConf + (1 - nextConf) * 0.25).toFixed(3)))
            : Math.max(0.15, Number((nextConf * 0.85).toFixed(3)));
        }
        const initStatus = nextConf >= 0.78 ? "known" : outcomes[0] ? "weak" : "unknown";

        const { error } = await supabase.from("learner_concepts").insert({
          user_id: params.userId,
          language: params.language,
          concept,
          status: initStatus,
          confidence: nextConf,
          error_count: errorsAdded,
          confusion_note: errorsAdded > 0 ? "Needs practice from adaptive quiz" : "",
          last_practiced: nowIso,
          next_review_at: computeNextReviewTimestamp(nextConf),
        });
        if (!error) updated = outcomes.length;
      }
      return updated;
    }),
  );

  return { updatedCount: counts.reduce((sum, n) => sum + n, 0) };
}

