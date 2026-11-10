import type { TutorMessage } from "@/types/api";

const STORAGE_PREFIX = "gm-mentor-history:";
const MAX_LOCAL_MESSAGES = 100;

export function getMentorStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadLocalMentorHistory(userId?: string | null): TutorMessage[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getMentorStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is TutorMessage =>
          Boolean(m) &&
          typeof m === "object" &&
          typeof (m as TutorMessage).id === "string" &&
          ((m as TutorMessage).role === "user" || (m as TutorMessage).role === "assistant") &&
          typeof (m as TutorMessage).content === "string" &&
          !(m as TutorMessage).id.startsWith("tmp-"),
      )
      .slice(-MAX_LOCAL_MESSAGES);
  } catch {
    return [];
  }
}

export function saveLocalMentorHistory(
  userId: string | null | undefined,
  messages: TutorMessage[],
): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const clean = messages
      .filter((m) => m.id && !m.id.startsWith("tmp-"))
      .slice(-MAX_LOCAL_MESSAGES)
      .map((m) => {
        const copy: TutorMessage = { ...m };
        delete copy.persistenceWarning;
        delete copy.privacyWarning;
        return copy;
      });
    window.localStorage.setItem(getMentorStorageKey(userId), JSON.stringify(clean));
  } catch {
    // Ignore quota / storage errors silently
  }
}

export function clearLocalMentorHistory(userId?: string | null): void {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getMentorStorageKey(userId));
  } catch {
    // ignore
  }
}

/**
 * Combines cloud history from Supabase with pre-migration local messages so learners
 * keep continuous conversation context across reloads and even after enabling Supabase tables.
 */
export function mergeMentorHistory(
  serverMsgs: TutorMessage[],
  localMsgs: TutorMessage[],
): TutorMessage[] {
  if (serverMsgs.length === 0) return localMsgs;
  if (localMsgs.length === 0) return serverMsgs;

  const firstServerTs = Date.parse(serverMsgs[0]?.created_at ?? "") || Number.MAX_SAFE_INTEGER;
  const serverSignature = new Set(serverMsgs.map((m) => `${m.role}::${m.content.trim()}`));

  const preMigrationLocal = localMsgs.filter((m) => {
    const ts = Date.parse(m.created_at ?? "");
    const isLocalOnlyId = m.id.startsWith("ephemeral-") || m.id.startsWith("spoken-");
    if (!isLocalOnlyId) return false;
    if (serverSignature.has(`${m.role}::${m.content.trim()}`)) return false;
    return Number.isFinite(ts) ? ts <= firstServerTs : true;
  });

  return [...preMigrationLocal, ...serverMsgs].slice(-MAX_LOCAL_MESSAGES);
}
