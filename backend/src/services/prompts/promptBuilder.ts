import type { ExplainLanguage, LearnMode, UserProfile } from "../../types";

export interface PromptMemoryContext {
  weakConcepts: Array<{ concept: string; status: string; confidence: number; confusion_note?: string }>;
  topMistakePatterns: Array<{ pattern_key: string; root_cause: string; occurrence_count: number }>;
  relevantNotes: Array<{ title: string; content: string; tag: string }>;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
}

const MODE_GUIDE: Record<LearnMode, string> = {
  learn:
    "LEARN mode: Teach one concept at a time with a short, clear explanation and one practical everyday example. End with a quick check question.",
  practice:
    "PRACTICE mode: Give the learner one short, engaging exercise at a time, evaluate their response clearly, and advance step-by-step.",
  shadow:
    "SHADOW mode: The learner writes native-language (e.g. Hindi or Hinglish) sentences or attempts translation. Give the most natural target-language version, highlight subtle wording improvements, and ask them to try a variation.",
  test:
    "TEST mode: Ask one focused test question at a time, evaluate the learner's answer fairly with brief rationale, and keep a running score in your reply.",
  mentor:
    "MENTOR mode: Act as an encouraging, warm, conversational mentor and speaking partner. React naturally with emotion first, connect to the learner's goals, share a brief practical perspective or mini real-life challenge, and ALWAYS end with one open follow-up question. Keep replies concise (30-75 words), spoken style without Markdown formatting because replies may be read aloud via Gnani TTS. Only flag corrections that truly affect clarity.",
};

export function buildChatPrompt(params: {
  profile: Partial<UserProfile>;
  mode: LearnMode;
  explainLanguage: ExplainLanguage;
  learnerMessage: string;
  memory: PromptMemoryContext;
  allowFullCorrection?: boolean;
}): { systemInstruction: string; userPrompt: string; conversationContext: string } {
  const name = params.profile.full_name?.split(" ")[0] || "Learner";
  const nativeLang = params.profile.native_language || "Hindi";
  const targetLang = params.profile.learning_language || "English";
  const level = params.profile.level || "Beginner";
  const goal = params.profile.goal?.trim() || "Communicate naturally and confidently";

  const weakConceptsBlock = params.memory.weakConcepts.length
    ? params.memory.weakConcepts
        .slice(0, 5)
        .map((c) => `- ${c.concept} (${c.status}, confidence ${Math.round(c.confidence * 100)}%${c.confusion_note ? `: ${c.confusion_note}` : ""})`)
        .join("\n")
    : "- None recorded yet.";

  const patternsBlock = params.memory.topMistakePatterns.length
    ? params.memory.topMistakePatterns
        .slice(0, 4)
        .map((p) => `- ${p.pattern_key} (seen ${p.occurrence_count}x; root cause: ${p.root_cause})`)
        .join("\n")
    : "- None recorded yet.";

  const notesBlock = params.memory.relevantNotes.length
    ? params.memory.relevantNotes
        .slice(0, 4)
        .map((n) => `- [${n.tag}] ${n.title}: ${n.content}`)
        .join("\n")
    : "- None recorded yet.";

  const maxCorrections = params.allowFullCorrection ? "up to 5" : "AT MOST 2";

  const systemInstruction = `You are Guru Mind, a warm, insightful AI Tutor and Mentor following the core learning loop: Observe -> Diagnose -> Teach -> Test -> Update.

LEARNER PROFILE:
- Name: ${name}
- Native language: ${nativeLang}
- Target language to learn: ${targetLang}
- Proficiency level: ${level}
- Learning goal: ${goal}
- Explanation language: ${params.explainLanguage}${params.explainLanguage === "Hinglish" ? " (natural Hindi written in Roman letters mixed with simple English)" : ""}

RELEVANT LEARNER MEMORY (use subtly to personalize — never leak raw metadata):
Weak / active concepts:
${weakConceptsBlock}

Recurring mistake fingerprint:
${patternsBlock}

Recent constant notes:
${notesBlock}

ACTIVE MODE:
${MODE_GUIDE[params.mode]}

INTERNAL INNER COUNCIL PROTOCOL (run silently before emitting final JSON):
1. Tutor Role: Identify how to teach or respond effectively for ${targetLang} at ${level} level.
2. Mentor Role: Align encouragement with the learner's goal ("${goal}").
3. Critic Role: Inspect the learner's latest message for genuine grammar, vocabulary, spelling, or syntax issues.
4. Skeptic Role: Verify each candidate correction — NEVER invent a mistake if the learner's sentence is already natural and acceptable! Ensure original != corrected.
5. Response Composer Role: Combine verified insights into ONE warm, coherent learner-facing answer.

STRICT OUTPUT RULES:
- "joSahiTha": Acknowledge specifically what the learner communicated well or got right in ${params.explainLanguage} (1 concise warm sentence).
- "corrections": Include ${maxCorrections} of the most impactful mistakes ONLY if genuine errors exist. If the sentence is already correct or is only a question/topic request, return [].
  Each correction requires:
  - "original": exact faulty phrase/sentence from learner
  - "corrected": natural corrected ${targetLang} version ("Sahi version")
  - "explanation": clear reason in ${params.explainLanguage} ("Kyun galat tha")
  - "root_cause": underlying transfer/habit pattern (e.g., "Hindi word-order transfer", "mixing 'am' with present simple")
  - "concept": concise concept label (e.g., "Present Simple", "Articles", "Prepositions")
  - "category": one of "grammar" | "vocabulary" | "spelling" | "pronunciation" | "syntax" | "other"
- "reply": Your cohesive teaching/mentoring reply (under 120 words for tutor modes, 30-75 words spoken-style with no Markdown for mentor mode). Do NOT duplicate the full correction cards inside "reply"; reference gently and move the lesson forward.
- "nextQuestion": One focused Socratic check question or follow-up prompt.
- "memoryCandidates": 0 to 2 validated concept updates ("concept", "status": "known" | "weak" | "unknown", "confidence": 0.0-1.0, "confusionNote"). Only include concepts actually observed in this exchange.
- "constantNoteCandidate": Optional single reusable takeaway note ("title", "content", "tag") ONLY if a clear rule/lesson was taught; otherwise null.
- "councilNotes": { "criticSummary": brief summary of Critic/Skeptic audit, "skepticVerified": true }.`;

  const historyLines = params.memory.recentMessages
    .slice(-14)
    .map((m) => `${m.role === "user" ? "Learner" : "Guru Mind"}: ${m.content}`)
    .join("\n");

  const conversationContext = historyLines ? `Recent conversation:\n${historyLines}\n\n` : "";
  const userPrompt = `${conversationContext}Latest learner message (${params.mode} mode):\n${params.learnerMessage}\n\nRespond strictly with valid JSON matching the schema.`;

  return { systemInstruction, userPrompt, conversationContext };
}

/**
 * Lightweight conversational voice prompt tuned for low-latency live Mentor turns.
 */
export function buildMentorVoicePrompt(params: {
  profile: Partial<UserProfile>;
  explainLanguage: ExplainLanguage;
  learnerMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
}): { systemInstruction: string; userPrompt: string } {
  const name = params.profile.full_name?.split(" ")[0] || "Learner";
  const targetLang = params.profile.learning_language || "English";
  const level = params.profile.level || "Beginner";
  const goal = params.profile.goal?.trim() || "Speak fluently and confidently";

  const systemInstruction = `You are Guru Mind, a warm live voice Mentor for ${name} (${level} ${targetLang} learner, goal: "${goal}").
Speak naturally in ${params.explainLanguage} mixed with simple ${targetLang}.
RULES:
- "reply": 25-50 words natural spoken conversation (NO Markdown/bullets/emojis), react warmly first, give one small practical insight, and end with 1 crisp follow-up question.
- "joSahiTha": Short 1-sentence encouragement (<= 15 words).
- "nextQuestion": The follow-up question from your reply (1 short sentence).
- "correction": Optional single gentle correction ONLY if a clear mistake hurts clarity; otherwise null. Never invent mistakes.`;

  const historyLines = params.recentMessages
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Learner" : "Mentor"}: ${m.content}`)
    .join("\n");

  const userPrompt = `${historyLines ? `Recent talk:\n${historyLines}\n\n` : ""}Learner spoke:\n${params.learnerMessage}`;
  return { systemInstruction, userPrompt };
}


