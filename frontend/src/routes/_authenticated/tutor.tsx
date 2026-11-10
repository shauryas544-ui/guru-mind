import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Copy,
  Mic,
  MicOff,
  Trash2,
  BookOpen,
  Dumbbell,
  Languages,
  ClipboardCheck,
  RotateCcw,
  Volume2,
  CheckCircle2,
  Sparkles,
  Flag,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LogoMark } from "@/components/Logo";
import { useProfile } from "@/components/app-shell";
import {
  clearTutorHistory,
  getTutorHistory,
  sendTutorMessage,
  type TutorMessage,
  type Correction,
} from "@/lib/tutor.functions";
import { cn } from "@/lib/utils";
import { getExplainLanguage } from "@/lib/language";
import { useGnaniVoice } from "@/hooks/use-voice";
import { api } from "@/services/api";
import type { SessionReview } from "@/types/api";

export const Route = createFileRoute("/_authenticated/tutor")({
  head: () => ({
    meta: [
      { title: "AI Tutor — Guru Mind" },
      { name: "description", content: "Learn English with your personal AI tutor." },
    ],
  }),
  component: Tutor,
});

const modes = [
  { id: "learn", label: "Learn", icon: BookOpen, hint: "Understand a new topic" },
  { id: "practice", label: "Practice", icon: Dumbbell, hint: "Solve questions and improve" },
  {
    id: "shadow",
    label: "Shadow",
    icon: Languages,
    hint: "Turn Hindi sentences into natural English",
  },
  { id: "test", label: "Test", icon: ClipboardCheck, hint: "Check your knowledge" },
] as const;
type Mode = (typeof modes)[number]["id"];

const starters = [
  "Teach me the Past Simple",
  "I am go to college every day.",
  "Mujhe kal market jaana hai",
  "Give me a short test on articles",
];

function Tutor() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [mode, setMode] = useState<Mode>("learn");
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const [sessionReview, setSessionReview] = useState<SessionReview | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["tutor"],
    queryFn: () => getTutorHistory(),
  });

  const voice = useGnaniVoice({
    language: profile?.learning_language || "English",
    voice: profile?.voice_preference || "Shivani",
    onTranscript: (spoken) => {
      setText((prev) => (prev ? `${prev} ${spoken}` : spoken));
      inputRef.current?.focus();
    },
  });

  const send = useMutation({
    mutationFn: (t: string) =>
      sendTutorMessage({
        data: { text: t, mode, explain: getExplainLanguage(), sessionId: activeSessionId },
      }),
    onMutate: (t) => {
      setPending(t);
      return { sentText: t };
    },
    onSuccess: (reply, _t, context) => {
      if (reply.privacyWarning) toast.info(reply.privacyWarning);
      if (reply.persistenceWarning) toast.warning(reply.persistenceWarning);

      qc.setQueryData<TutorMessage[]>(["tutor"], (old = []) => [
        ...old,
        {
          id: `local-${Date.now()}`,
          ...(reply.session_id ? { session_id: reply.session_id } : {}),
          role: "user",
          content: context?.sentText ?? "",
          mode,
          corrections: [],
          created_at: new Date().toISOString(),
        },
        reply,
      ]);

      if (reply.session_id) {
        setActiveSessionId(reply.session_id);
        if ((reply.corrections ?? []).length > 0) {
          qc.invalidateQueries({ queryKey: ["mistakes"] });
          qc.invalidateQueries({ queryKey: ["learner-model"] });
        }
        qc.invalidateQueries({ queryKey: ["constant-notes"] });
      }
    },
    onError: (e, t) => {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
      setText(t);
    },
    onSettled: () => {
      setPending(null);
      inputRef.current?.focus();
    },
  });

  const clear = useMutation({
    mutationFn: () => clearTutorHistory(),
    onSuccess: () => {
      setActiveSessionId(undefined);
      qc.invalidateQueries({ queryKey: ["tutor"] });
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: async () => {
      const sid = activeSessionId || [...messages].reverse().find((m) => m.session_id)?.session_id;
      if (!sid) throw new Error("Send at least one message before ending a session.");
      return api.endSession(sid, getExplainLanguage());
    },
    onSuccess: (res) => {
      setSessionReview(res.review);
      setActiveSessionId(undefined);
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["constant-notes"] });
      qc.invalidateQueries({ queryKey: ["memory-cards"] });
      qc.invalidateQueries({ queryKey: ["weekly-report"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not generate session review."),
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending]);

  function submit(t = text) {
    const v = t.trim();
    if (!v || send.isPending) return;
    setText("");
    send.mutate(v);
  }

  const allCorrections = messages.flatMap((m) => m.corrections ?? []);
  const concepts = Array.from(new Set(allCorrections.map((c) => c.concept))).slice(0, 5);
  const canEndSession = Boolean(activeSessionId || messages.some((m) => m.session_id));

  return (
    <div className="flex h-[calc(100svh-3.5rem)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              title={m.hint}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                mode === m.id
                  ? "border-primary bg-primary-soft font-medium text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <m.icon className="size-4" /> {m.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => endSessionMutation.mutate()}
              disabled={!canEndSession || endSessionMutation.isPending}
            >
              <Flag className="size-3.5" />
              {endSessionMutation.isPending ? "Reviewing…" : "End & Review"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => clear.mutate()}
              disabled={!messages.length || clear.isPending}
            >
              <Trash2 /> Clear
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
            {!isLoading && messages.length === 0 && !pending && (
              <div className="py-10 text-center">
                <LogoMark className="mx-auto size-14" />
                <h1 className="mt-5 font-display text-3xl font-semibold">
                  Namaste! I'm your tutor.
                </h1>
                <p className="mt-2 text-muted-foreground">
                  {modes.find((m) => m.id === mode)?.hint}. Write or speak anything — I'll gently
                  correct up to two mistakes at a time.
                </p>
                <div className="mt-8 grid gap-2 sm:grid-cols-2">
                  {starters.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="surface p-3.5 text-left text-sm hover:border-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <Bubble
                key={m.id}
                m={m}
                onRetry={(t) => {
                  setText(t);
                  inputRef.current?.focus();
                }}
                onSpeak={(content) => voice.speak(content, true)}
                onQuickReply={(q) => submit(q)}
              />
            ))}
            {send.isPending && pending && (
              <>
                <div className="ml-auto w-fit max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                  {pending}
                </div>
                <div className="flex items-center gap-3">
                  <LogoMark className="size-8" />
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="size-2 animate-bounce rounded-full bg-muted-foreground/60"
                        style={{ animationDelay: `${i * 120}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t border-border bg-background p-4">
          <div className="surface mx-auto flex max-w-3xl items-end gap-2 p-2">
            <Textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={
                voice.recording
                  ? "Listening via Gnani Voice AI…"
                  : voice.transcribing
                    ? "Transcribing speech…"
                    : mode === "shadow"
                      ? "Write a sentence in Hindi…"
                      : "Write in English — mistakes are welcome…"
              }
              rows={1}
              className="max-h-40 min-h-11 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button
              variant={voice.recording ? "destructive" : "ghost"}
              size="icon"
              title={voice.recording ? "Stop recording" : "Speak with Gnani Voice AI"}
              onClick={voice.toggleRecording}
              disabled={voice.transcribing}
              aria-label="Voice input"
            >
              {voice.recording ? <MicOff /> : <Mic />}
            </Button>
            <Button
              size="icon"
              onClick={() => submit()}
              disabled={!text.trim() || send.isPending}
              aria-label="Send"
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
      </div>

      <aside className="hidden w-72 shrink-0 space-y-6 border-l border-border p-5 xl:block">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current mode
          </p>
          <p className="mt-1 font-semibold">{modes.find((m) => m.id === mode)?.label} mode</p>
          <p className="text-sm text-muted-foreground">{modes.find((m) => m.id === mode)?.hint}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI Engines
          </p>
          <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" /> Reasoning: Gemini Inner Council
            </p>
            <p className="flex items-center gap-1.5">
              <Volume2 className="size-3.5 text-primary" /> Voice: Gnani Vachana STT/TTS
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Concepts to watch
          </p>
          {concepts.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {concepts.map((c) => (
                <li key={c} className="rounded-full bg-warning-soft px-2.5 py-1 text-xs">
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">None yet.</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mistakes this conversation
          </p>
          <p className="mt-1 text-3xl font-bold">{allCorrections.length}</p>
        </div>
      </aside>

      <Dialog
        open={Boolean(sessionReview)}
        onOpenChange={(open) => !open && setSessionReview(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">End-of-Session Review</DialogTitle>
            <DialogDescription>
              Here is your personalized summary, homework, and next step.
            </DialogDescription>
          </DialogHeader>
          {sessionReview && (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl bg-muted p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Session Summary
                </p>
                <p className="mt-1 leading-relaxed">{sessionReview.summary}</p>
              </div>
              {sessionReview.mistakeReview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Key Mistake Review
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {sessionReview.mistakeReview.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Homework
                </p>
                <p className="mt-1">{sessionReview.homework}</p>
              </div>
              <div className="rounded-xl bg-primary-soft p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Next Session Focus
                </p>
                <p className="mt-1">{sessionReview.nextSessionGuidance}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Bubble({
  m,
  onRetry,
  onSpeak,
  onQuickReply,
}: {
  m: TutorMessage;
  onRetry: (t: string) => void;
  onSpeak: (t: string) => void;
  onQuickReply: (t: string) => void;
}) {
  const time = new Date(m.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (m.role === "user") {
    return (
      <div className="ml-auto flex max-w-[80%] flex-col items-end">
        <div className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {m.content}
        </div>
        <span className="mt-1 text-xs text-muted-foreground">{time}</span>
      </div>
    );
  }
  const joSahiTha = m.joSahiTha || m.jo_sahi_tha;
  const nextQuestion = m.nextQuestion || m.next_question;

  return (
    <div className="flex gap-3">
      <LogoMark className="size-8 shrink-0" />
      <div className="min-w-0 flex-1 space-y-3">
        {joSahiTha && (
          <div className="flex items-start gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            <div>
              <span className="font-semibold text-success">Jo sahi tha: </span>
              <span>{joSahiTha}</span>
            </div>
          </div>
        )}
        {(m.corrections ?? []).map((c, i) => (
          <CorrectionCard key={i} c={c} onRetry={onRetry} />
        ))}
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
          {m.content.replace(/\*\*(.*?)\*\*/g, "$1")}
        </div>
        {nextQuestion && (
          <button
            onClick={() => onQuickReply(nextQuestion)}
            className="block rounded-xl border border-border bg-card px-3.5 py-2 text-left text-sm text-primary transition-colors hover:border-primary"
          >
            <span className="font-medium">Next check:</span> {nextQuestion}
          </button>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{time}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => {
              navigator.clipboard.writeText(m.content);
              toast.success("Copied");
            }}
            aria-label="Copy"
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onSpeak(m.content)}
            aria-label="Listen"
          >
            <Volume2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function CorrectionCard({ c, onRetry }: { c: Correction; onRetry: (t: string) => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm shadow-soft">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your sentence
          </p>
          <p className="mt-1 text-destructive">{c.original}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sahi version
          </p>
          <p className="mt-1 font-medium text-success">{c.corrected}</p>
        </div>
      </div>
      <p className="mt-3 text-muted-foreground">
        <span className="font-medium text-foreground">Kyun galat tha: </span>
        {c.explanation}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs">
          Root cause: {c.root_cause}
        </span>
        <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs text-primary">
          {c.concept}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7"
          onClick={() => onRetry(c.original)}
        >
          <RotateCcw className="size-3.5" /> Try again
        </Button>
      </div>
    </div>
  );
}
