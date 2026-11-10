import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Flag,
  History,
  Mic,
  MicOff,
  PhoneCall,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogoMark } from "@/components/Logo";
import { Page, PageHeader, useProfile } from "@/components/app-shell";
import { useGnaniVoice } from "@/hooks/use-voice";
import { supabase } from "@/integrations/supabase/client";
import { getExplainLanguage } from "@/lib/language";
import {
  clearLocalMentorHistory,
  loadLocalMentorHistory,
  mergeMentorHistory,
  saveLocalMentorHistory,
} from "@/lib/mentor-history";
import {
  clearMentorHistory,
  getMentorHistory,
  sendTutorMessage,
  type TutorMessage,
} from "@/lib/tutor.functions";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { SessionReview } from "@/types/api";

export const Route = createFileRoute("/_authenticated/mentor")({
  head: () => ({
    meta: [
      { title: "AI Mentor (Live Voice) — Guru Mind" },
      {
        name: "description",
        content: "Talk directly by voice with your personal Guru Mind AI Mentor.",
      },
    ],
  }),
  component: Mentor,
});

const VOICE_SUGGESTIONS = [
  "Hi Mentor, I feel nervous speaking English at work.",
  "Let's practise a realistic job interview together.",
  "Help me talk confidently about my daily routine.",
];

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Mentor() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const lang = profile?.learning_language || "English";
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const userId = profile?.id ?? sessionUserId;

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.id) {
        setSessionUserId(data.session.user.id);
      }
    });
  }, []);

  const { data: msgs = [] } = useQuery({
    queryKey: ["mentor"],
    queryFn: async () => {
      const uid =
        profile?.id ??
        sessionUserId ??
        (await supabase.auth.getSession()).data.session?.user?.id ??
        null;
      if (uid && !sessionUserId) setSessionUserId(uid);
      const localMsgs = loadLocalMentorHistory(uid);
      const serverMsgs = await getMentorHistory();
      const merged = mergeMentorHistory(serverMsgs, localMsgs);
      if (merged.length > 0 && profile?.save_history !== false) {
        saveLocalMentorHistory(uid, merged);
      }
      return merged;
    },
  });
  const { data: voiceConfig } = useQuery({
    queryKey: ["voice-config"],
    queryFn: () => api.getVoiceConfig(),
  });

  const [voiceOn, setVoiceOn] = useState(true);
  const [handsFree, setHandsFree] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>(
    profile?.voice_preference || "Shivani",
  );
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const [review, setReview] = useState<SessionReview | null>(null);
  const [schemaNotice, setSchemaNotice] = useState<string | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [copyingSql, setCopyingSql] = useState(false);

  const supabaseProjectRef = String(import.meta.env.VITE_SUPABASE_URL ?? "").match(
    /https:\/\/([^.]+)\.supabase\.co/i,
  )?.[1];
  const supabaseSqlEditorUrl = supabaseProjectRef
    ? `https://supabase.com/dashboard/project/${supabaseProjectRef}/sql/new`
    : "https://supabase.com/dashboard";

  async function handleCopySchemaSql() {
    if (copyingSql) return;
    setCopyingSql(true);
    try {
      const { sql } = await api.getSchemaSql();
      await navigator.clipboard.writeText(sql);
      toast.success("Setup SQL copied! Open SQL Editor, paste, and click Run.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load migration SQL.");
    } finally {
      setCopyingSql(false);
    }
  }

  const endRef = useRef<HTMLDivElement>(null);
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const startListeningRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (profile?.voice_preference) setSelectedVoice(profile.voice_preference);
  }, [profile?.voice_preference]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const send = useMutation({
    mutationFn: (spokenText: string) => {
      const history = (qc.getQueryData<TutorMessage[]>(["mentor"]) ?? [])
        .filter((m) => !m.id.startsWith("tmp-"))
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));
      return sendTutorMessage({
        data: {
          text: spokenText,
          mode: "mentor",
          explain: getExplainLanguage(),
          sessionId: activeSessionId,
          history,
        },
      });
    },
    onMutate: (spokenText) => {
      const tempId = `tmp-${Date.now()}`;
      qc.setQueryData<TutorMessage[]>(["mentor"], (old = []) => [
        ...old,
        {
          id: tempId,
          role: "user",
          content: spokenText,
          mode: "mentor",
          corrections: [],
          created_at: new Date().toISOString(),
        },
      ]);
      return { tempId };
    },
    onSuccess: async (reply, _spokenText, context) => {
      if (reply.persistenceWarning) {
        setSchemaNotice(reply.persistenceWarning);
      } else {
        setSchemaNotice(null);
      }

      const uid = userId ?? (await supabase.auth.getSession()).data.session?.user?.id ?? null;

      qc.setQueryData<TutorMessage[]>(["mentor"], (old = []) => {
        const updated = [
          ...old.map((m) =>
            m.id === context?.tempId
              ? {
                  ...m,
                  id: `spoken-${Date.now()}`,
                  ...(reply.session_id ? { session_id: reply.session_id } : {}),
                }
              : m,
          ),
          reply,
        ];
        if (profile?.save_history !== false) {
          saveLocalMentorHistory(uid, updated);
        }
        return updated;
      });

      if (reply.session_id) {
        setActiveSessionId(reply.session_id);
        if ((reply.corrections ?? []).length > 0) {
          qc.invalidateQueries({ queryKey: ["mistakes"] });
        }
      }

      gnaniVoice.speak(reply.content, voiceOn, () => {
        if (handsFreeRef.current) {
          void startListeningRef.current?.();
        }
      });
    },
    onError: (e, _spokenText, context) => {
      setHandsFree(false);
      toast.error(e instanceof Error ? e.message : "Mentor couldn't reply.");
      qc.setQueryData<TutorMessage[]>(["mentor"], (old = []) =>
        old.filter((m) => m.id !== context?.tempId),
      );
    },
  });

  const gnaniVoice = useGnaniVoice({
    language: lang,
    voice: selectedVoice,
    autoStopOnSilence: handsFree,
    onTranscript: (spoken) => {
      const cleaned = spoken.trim();
      if (!cleaned || send.isPending) return;
      send.mutate(cleaned);
    },
    onVoiceError: () => {
      setHandsFree(false);
    },
  });

  startListeningRef.current = gnaniVoice.startRecording;

  const clear = useMutation({
    mutationFn: () => clearMentorHistory(),
    onSuccess: async () => {
      setActiveSessionId(undefined);
      gnaniVoice.stopAudioPlayback();
      const uid = userId ?? (await supabase.auth.getSession()).data.session?.user?.id ?? null;
      clearLocalMentorHistory(uid);
      qc.setQueryData(["mentor"], []);
      qc.invalidateQueries({ queryKey: ["mentor"] });
    },
  });

  const endSession = useMutation({
    mutationFn: async () => {
      const sid = activeSessionId || [...msgs].reverse().find((m) => m.session_id)?.session_id;
      if (!sid) {
        throw new Error(
          schemaNotice
            ? "Session reviews require database tables — run 0001_initial_schema.sql in Supabase first."
            : "Have a voice conversation with your mentor first before generating a review.",
        );
      }
      return api.endSession(sid, getExplainLanguage());
    },
    onSuccess: (res) => {
      setReview(res.review);
      setActiveSessionId(undefined);
      setHandsFree(false);
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["constant-notes"] });
      qc.invalidateQueries({ queryKey: ["memory-cards"] });
      qc.invalidateQueries({ queryKey: ["weekly-report"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not generate session review."),
  });

  const voices = voiceConfig?.voices ?? [
    { id: "Shivani", label: "Shivani (Warm, Clear)", gender: "Female" },
    { id: "Devansh", label: "Devansh (Calm, Friendly)", gender: "Male" },
    { id: "Riyaa", label: "Riyaa (Energetic)", gender: "Female" },
  ];

  const isBusy = gnaniVoice.transcribing || send.isPending;

  function handlePrimaryMicClick() {
    if (isBusy) return;
    if (gnaniVoice.speaking) {
      gnaniVoice.stopAudioPlayback();
      void gnaniVoice.startRecording();
      return;
    }
    void gnaniVoice.toggleRecording();
  }

  return (
    <Page>
      <PageHeader
        title="AI Mentor — Direct Voice"
        subtitle={`Speak directly in ${lang} or Hinglish — voice-only conversation with Gnani Speech AI + Gemini Mentor.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Mentor voice" />
              </SelectTrigger>
              <SelectContent>
                {voices.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setVoiceOn((v) => !v);
                gnaniVoice.stopAudioPlayback();
              }}
            >
              {voiceOn ? (
                <>
                  <Volume2 /> Voice on
                </>
              ) : (
                <>
                  <VolumeX /> Voice off
                </>
              )}
            </Button>
            {msgs.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => endSession.mutate()}
                  disabled={endSession.isPending}
                >
                  <Flag /> End & Review
                </Button>
                <Button variant="ghost" size="sm" onClick={() => clear.mutate()}>
                  <Trash2 /> Clear
                </Button>
              </>
            )}
          </div>
        }
      />

      {schemaNotice && !noticeDismissed && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle className="flex items-center justify-between gap-2">
            <span>Saved on this device · Cloud sync (Supabase) optional</span>
            <button
              type="button"
              onClick={() => setNoticeDismissed(true)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Hide notice"
              title="Hide notice"
            >
              <X className="size-3.5" />
            </button>
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Your Mentor conversation is saved in this browser so you can resume right from where
              you left off. To sync across devices &amp; unlock Session Reviews, copy &amp; run the
              setup SQL once in Supabase.
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleCopySchemaSql()}
                disabled={copyingSql}
              >
                <Copy className="size-3.5" />
                {copyingSql ? "Copying…" : "Copy Setup SQL"}
              </Button>
              <Button size="sm" asChild>
                <a href={supabaseSqlEditorUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                  Open SQL Editor
                </a>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <section className="surface flex min-h-[460px] flex-col p-4">
        <div className="flex-1 space-y-4 overflow-y-auto p-2">
          {msgs.length > 0 && (
            <div className="flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                <History className="size-3.5 text-primary" />
                Conversation saved ({msgs.length} messages) — speak anytime to continue from here
              </span>
            </div>
          )}
          {msgs.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              <LogoMark className="mx-auto size-12" />
              <p className="mt-3 text-base font-medium text-foreground">
                Talk directly with your Mentor
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm">
                Mentor is voice-only — no typing needed. Tap the microphone below, speak naturally,
                and tap again to hear your Mentor reply out loud.
              </p>
              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Try saying out loud:
                </p>
                <div className="mt-2.5 flex flex-wrap justify-center gap-2">
                  {VOICE_SUGGESTIONS.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs text-foreground"
                    >
                      “{s}”
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {msgs.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                  {m.role === "user" ? "You (Spoken)" : `Mentor · ${selectedVoice}`}
                </p>
                {m.content}
                {m.corrections?.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
                    {m.corrections.map((c, i) => (
                      <p key={i}>
                        <span className="line-through opacity-70">{c.original}</span> →{" "}
                        <span className="font-medium">{c.corrected}</span>
                      </p>
                    ))}
                  </div>
                )}
                {m.role === "assistant" && (
                  <button
                    type="button"
                    className="mt-1.5 block text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => gnaniVoice.speak(m.content, true)}
                    aria-label="Play voice reply"
                  >
                    ▶ Listen again
                  </button>
                )}
              </div>
            </div>
          ))}

          {gnaniVoice.transcribing && (
            <p className="text-sm text-primary">Converting your speech via Gnani Voice AI…</p>
          )}
          {send.isPending && (
            <p className="text-sm text-muted-foreground">Mentor is thinking of a reply…</p>
          )}
          <div ref={endRef} />
        </div>

        {/* Direct Voice-Only Talk Dock */}
        <div className="mt-3 rounded-2xl border border-border bg-background/80 p-4">
          <div className="flex flex-col items-center gap-3">
            {/* Live mic voice activity bars while recording */}
            {gnaniVoice.recording && (
              <div className="flex h-6 items-center gap-1" aria-hidden>
                {[0.4, 0.7, 1, 0.7, 0.4].map((weight, idx) => {
                  const pct = Math.max(20, Math.min(100, gnaniVoice.audioLevel * weight * 115));
                  return (
                    <span
                      key={idx}
                      className="w-1.5 rounded-full bg-destructive transition-all duration-75"
                      style={{ height: `${pct}%` }}
                    />
                  );
                })}
                <span className="ml-2 text-xs font-medium text-destructive">
                  {formatDuration(gnaniVoice.recordingSeconds)}
                </span>
              </div>
            )}

            <div className="flex items-center gap-3">
              {gnaniVoice.recording && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={gnaniVoice.cancelRecording}
                  title="Cancel recording"
                  aria-label="Cancel recording"
                >
                  <X className="size-4" />
                </Button>
              )}

              <Button
                type="button"
                size="icon"
                variant={gnaniVoice.recording ? "destructive" : "default"}
                onClick={handlePrimaryMicClick}
                disabled={isBusy}
                className={cn(
                  "size-16 rounded-full shadow-lift transition-transform hover:scale-105",
                  gnaniVoice.recording && "animate-pulse ring-4 ring-destructive/25",
                )}
                aria-label={gnaniVoice.recording ? "Send spoken message" : "Start speaking"}
              >
                {gnaniVoice.recording ? <MicOff className="size-6" /> : <Mic className="size-6" />}
              </Button>

              {gnaniVoice.speaking && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={gnaniVoice.stopAudioPlayback}
                  title="Stop Mentor voice"
                >
                  <Square className="size-3.5" /> Stop voice
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 text-center">
              <p className="text-sm font-medium text-foreground">
                {gnaniVoice.recording
                  ? handsFree
                    ? "Listening… pause when done or tap red mic to send"
                    : "Listening… tap the red mic when you finish speaking"
                  : gnaniVoice.transcribing
                    ? "Transcribing speech via Gnani AI…"
                    : send.isPending
                      ? "Mentor is replying…"
                      : gnaniVoice.speaking
                        ? "Mentor is speaking… tap mic anytime to interrupt"
                        : "Tap the microphone and talk directly"}
              </p>
              <Button
                type="button"
                size="sm"
                variant={handsFree ? "default" : "outline"}
                onClick={() => setHandsFree((prev) => !prev)}
                className="h-7 rounded-full text-xs"
              >
                <PhoneCall className="size-3.5" />
                {handsFree ? "Hands-free call: ON" : "Hands-free call: OFF"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={Boolean(review)} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Mentor Session Review</DialogTitle>
            <DialogDescription>
              Summary and real-life challenge for your next spoken session.
            </DialogDescription>
          </DialogHeader>
          {review && (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl bg-muted p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Summary
                </p>
                <p className="mt-1">{review.summary}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Real-life Mission / Homework
                </p>
                <p className="mt-1">{review.homework}</p>
              </div>
              <div className="rounded-xl bg-primary-soft p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Next Check-in
                </p>
                <p className="mt-1">{review.nextSessionGuidance}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
