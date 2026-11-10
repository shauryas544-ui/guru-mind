export const LEARN_LANGUAGES = ["English", "Hindi", "Spanish", "French", "German"] as const;
export const NATIVE_LANGUAGES = [
  "Hindi",
  "Tamil",
  "Telugu",
  "Kannada",
  "Marathi",
  "Bengali",
  "Gujarati",
  "Punjabi",
  "Malayalam",
  "English",
] as const;
export const EXPLAIN_LANGUAGES = ["Hinglish", "Hindi", "English"] as const;
export type ExplainLanguage = (typeof EXPLAIN_LANGUAGES)[number];

const KEY = "gm-explain-language";
export function getExplainLanguage(): ExplainLanguage {
  if (typeof window === "undefined") return "Hinglish";
  const v = window.localStorage.getItem(KEY);
  return (EXPLAIN_LANGUAGES as readonly string[]).includes(v ?? "")
    ? (v as ExplainLanguage)
    : "Hinglish";
}
export function setExplainLanguage(v: ExplainLanguage) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, v);
  }
}

export const SPEECH_CODES: Record<string, string> = {
  English: "en-IN",
  Hindi: "hi-IN",
  Hinglish: "en-IN",
  Spanish: "es-ES",
  French: "fr-FR",
  German: "de-DE",
};
