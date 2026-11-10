import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalMentorHistory,
  loadLocalMentorHistory,
  mergeMentorHistory,
  saveLocalMentorHistory,
} from "./mentor-history";
import type { TutorMessage } from "@/types/api";

function makeMsg(overrides: Partial<TutorMessage>): TutorMessage {
  return {
    id: "m-1",
    role: "user",
    content: "Hello Mentor",
    mode: "mentor",
    corrections: [],
    created_at: "2026-11-10T10:00:00.000Z",
    ...overrides,
  };
}

describe("mentor-history persistence", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => store.clear(),
      },
    });
  });

  it("saves, loads, isolates per user, and clears Mentor history without temp messages", () => {
    saveLocalMentorHistory("user-1", [
      makeMsg({ id: "tmp-999", content: "Unsent draft" }),
      makeMsg({ id: "spoken-1", role: "user", content: "My interview is tomorrow." }),
      makeMsg({
        id: "ephemeral-2",
        role: "assistant",
        content: "Let us practise your introduction.",
        persistenceWarning: "Temporary warning",
      }),
    ]);

    const loaded = loadLocalMentorHistory("user-1");
    expect(loaded).toHaveLength(2);
    expect(loaded[0].content).toBe("My interview is tomorrow.");
    expect(loaded[1].persistenceWarning).toBeUndefined();
    expect(loadLocalMentorHistory("user-2")).toEqual([]);

    clearLocalMentorHistory("user-1");
    expect(loadLocalMentorHistory("user-1")).toEqual([]);
  });

  it("falls back to local history when server has no saved rows and merges pre-migration turns", () => {
    const localMsgs = [
      makeMsg({
        id: "spoken-1",
        role: "user",
        content: "Hi Mentor",
        created_at: "2026-11-10T09:00:00.000Z",
      }),
      makeMsg({
        id: "ephemeral-2",
        role: "assistant",
        content: "Welcome back!",
        created_at: "2026-11-10T09:00:05.000Z",
      }),
    ];

    expect(mergeMentorHistory([], localMsgs)).toEqual(localMsgs);

    const serverMsgs = [
      makeMsg({
        id: "uuid-cloud-3",
        role: "user",
        content: "Let us continue.",
        created_at: "2026-11-10T10:00:00.000Z",
      }),
    ];
    const merged = mergeMentorHistory(serverMsgs, localMsgs);
    expect(merged.map((m) => m.id)).toEqual(["spoken-1", "ephemeral-2", "uuid-cloud-3"]);
  });
});

