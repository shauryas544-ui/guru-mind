import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Type,
  MessageSquare,
  PenLine,
  CheckCircle2,
  XCircle,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Page, PageHeader } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { PracticeQuestion } from "@/types/api";

export const Route = createFileRoute("/_authenticated/practice")({
  head: () => ({
    meta: [
      { title: "Practice — Guru Mind" },
      { name: "description", content: "Short practice sessions on your weak areas." },
    ],
  }),
  component: Practice,
});

const cats = [
  { id: "grammar", l: "Grammar", i: BookOpen },
  { id: "vocab", l: "Vocabulary", i: Type },
  { id: "speaking", l: "Sentence building", i: MessageSquare },
  { id: "writing", l: "Error spotting", i: PenLine },
] as const;

const quickTopics = [
  "Tenses",
  "Articles",
  "Prepositions",
  "Daily conversation",
  "Office & interview",
];

type CategoryId = (typeof cats)[number]["id"];

const offlineStarterQuestions: PracticeQuestion[] = [
  {
    id: "f1",
    question: "Yesterday I ___ to the market.",
    options: ["go", "went", "gone", "going"],
    correctIndex: 1,
    explanation: "'Yesterday' tells us it's the past, so we use the past form 'went'.",
    concept: "Past Simple",
  },
  {
    id: "f2",
    question: "She is ___ engineer.",
    options: ["a", "an", "the", "—"],
    correctIndex: 1,
    explanation: "'Engineer' starts with a vowel sound, so we use 'an'.",
    concept: "Articles",
  },
  {
    id: "f3",
    question: "I ___ to college every day.",
    options: ["am go", "going", "go", "goes"],
    correctIndex: 2,
    explanation: "For routines with 'I', use the base verb: 'I go'.",
    concept: "Present Simple",
  },
  {
    id: "f4",
    question: "We have lived here ___ 2019.",
    options: ["for", "since", "from", "at"],
    correctIndex: 1,
    explanation: "'Since' is used with a starting point in time.",
    concept: "Prepositions",
  },
  {
    id: "f5",
    question: "Which sentence is correct?",
    options: [
      "He don't like tea.",
      "He doesn't likes tea.",
      "He doesn't like tea.",
      "He not like tea.",
    ],
    correctIndex: 2,
    explanation: "With he/she/it use 'doesn't' + base verb.",
    concept: "Present Simple",
  },
];

function Practice() {
  const qc = useQueryClient();
  const [cat, setCat] = useState<CategoryId>("grammar");
  const [topic, setTopic] = useState("");
  const [len, setLen] = useState(5);
  const [started, setStarted] = useState(false);
  const [qs, setQs] = useState<PracticeQuestion[]>([]);
  const [seenQuestions, setSeenQuestions] = useState<string[]>([]);
  const [aiGenerated, setAiGenerated] = useState(true);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [outcomes, setOutcomes] = useState<Array<{ concept: string; correct: boolean }>>([]);

  const submitResults = useMutation({
    mutationFn: (results: Array<{ concept: string; correct: boolean }>) =>
      api.submitPracticeResults({ results }),
    onSuccess: (res) => {
      if (res.updatedCount > 0) {
        qc.invalidateQueries({ queryKey: ["learner-model"] });
        qc.invalidateQueries({ queryKey: ["weekly-report"] });
        toast.success("Learner Model updated with your quiz progress.");
      }
    },
    onError: () => {
      // Non-blocking if database tables haven't been created yet
    },
  });

  const startPractice = useMutation({
    mutationFn: () =>
      api.generatePractice({
        category: cat,
        count: len,
        topic: topic.trim() || undefined,
        excludeQuestions: seenQuestions.slice(-15),
      }),
    onMutate: () => {
      setGenerateError(null);
    },
    onSuccess: (res) => {
      if (!res.questions?.length) {
        setGenerateError("Gemini returned an empty quiz. Please try again.");
        toast.error("Gemini did not return any questions. Please retry.");
        return;
      }
      setQs(res.questions);
      setSeenQuestions((prev) => [...prev.slice(-15), ...res.questions.map((q) => q.question)]);
      setAiGenerated(true);
      setI(0);
      setPick(null);
      setScore(0);
      setOutcomes([]);
      setStarted(true);
    },
    onError: (err) => {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not generate new questions from Gemini AI right now.";
      setGenerateError(msg);
      toast.error(msg);
    },
  });

  const q = qs[Math.min(i, Math.max(0, qs.length - 1))];
  const finished = started && i >= qs.length;

  function choose(k: number) {
    if (pick !== null || !q) return;
    const isCorrect = k === q.correctIndex;
    setPick(k);
    if (isCorrect) setScore((s) => s + 1);
    setOutcomes((prev) => [...prev, { concept: q.concept, correct: isCorrect }]);
  }
  function next() {
    if (i + 1 >= qs.length && outcomes.length > 0) {
      submitResults.mutate(outcomes);
    }
    setPick(null);
    setI((x) => x + 1);
  }
  function reset() {
    setStarted(false);
    setGenerateError(null);
    setI(0);
    setPick(null);
    setScore(0);
    setOutcomes([]);
  }
  function loadOfflineSample() {
    setGenerateError(null);
    setQs(offlineStarterQuestions.slice(0, len));
    setAiGenerated(false);
    setI(0);
    setPick(null);
    setScore(0);
    setOutcomes([]);
    setStarted(true);
  }

  if (!started) {
    return (
      <Page>
        <PageHeader
          title="Practice Center"
          subtitle="Fresh, non-repeating questions generated live by Gemini AI around your weak areas."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={cn(
                "surface p-5 text-left transition-colors",
                cat === c.id && "border-primary bg-primary-soft",
              )}
            >
              <c.i className="size-6 text-primary" />
              <p className="mt-3 font-semibold">{c.l}</p>
            </button>
          ))}
        </div>
        <div className="surface space-y-5 p-6">
          <div>
            <p className="font-semibold">Topic or focus (optional)</p>
            <Input
              className="mt-2 max-w-lg"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Tenses, Articles, Office emails, Daily conversation…"
            />
            <div className="mt-2.5 flex flex-wrap gap-2">
              {quickTopics.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTopic(topic === t ? "" : t)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    topic === t
                      ? "border-primary bg-primary-soft font-medium text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="font-semibold">How long?</p>
            <div className="mt-2 flex gap-2">
              {[3, 5].map((n) => (
                <Button
                  key={n}
                  variant={len === n ? "default" : "outline"}
                  onClick={() => setLen(n)}
                >
                  {n} questions
                </Button>
              ))}
            </div>
          </div>

          {generateError && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive-soft p-3.5 text-sm">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>{generateError}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={loadOfflineSample}>
                Use offline sample instead
              </Button>
            </div>
          )}

          <Button
            size="lg"
            onClick={() => startPractice.mutate()}
            disabled={startPractice.isPending}
          >
            {startPractice.isPending ? (
              <>
                <Loader2 className="animate-spin" /> Generating fresh Gemini questions…
              </>
            ) : (
              <>
                <Sparkles /> {generateError ? "Retry Gemini AI" : "Start Gemini AI practice"}
              </>
            )}
          </Button>
        </div>
      </Page>
    );
  }

  if (finished || !q) {
    return (
      <Page>
        <div className="surface mx-auto max-w-lg p-10 text-center">
          <p className="text-sm text-muted-foreground">Session complete</p>
          <p className="mt-2 font-display text-5xl font-semibold">
            {score}/{qs.length}
          </p>
          <p className="mt-3 text-muted-foreground">
            {score === qs.length
              ? "Perfect! Ready for a brand-new set of harder Gemini questions?"
              : "Good work. Review what you learned or generate a fresh set from Gemini."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button onClick={() => startPractice.mutate()} disabled={startPractice.isPending}>
              {startPractice.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> Generating new questions…
                </>
              ) : (
                <>
                  <Sparkles /> Generate new questions (Gemini)
                </>
              )}
            </Button>
            <Button variant="outline" onClick={reset} disabled={startPractice.isPending}>
              Change topic
            </Button>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            Question {i + 1} of {qs.length}
            {aiGenerated ? " · Generated by Gemini AI" : " · Offline sample"}
          </span>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => startPractice.mutate()}
              disabled={startPractice.isPending}
            >
              {startPractice.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" /> New questions (Gemini)
                </>
              )}
            </Button>
            <span>Score {score}</span>
          </div>
        </div>
        <Progress value={(i / qs.length) * 100} className="mt-2 h-2" />
        <div className="surface mt-6 p-7">
          <span className="inline-block rounded-full bg-primary-soft px-2.5 py-0.5 text-xs text-primary">
            {q.concept}
          </span>
          <h2 className="mt-3 text-xl font-semibold">{q.question}</h2>
          <div className="mt-6 grid gap-3">
            {q.options.map((o, k) => (
              <button
                key={`${q.id}-${k}`}
                onClick={() => choose(k)}
                className={cn(
                  "flex items-center justify-between rounded-xl border p-4 text-left transition-colors",
                  pick === null && "border-border hover:border-primary",
                  pick !== null && k === q.correctIndex && "border-success bg-success-soft",
                  pick === k && k !== q.correctIndex && "border-destructive bg-destructive-soft",
                )}
              >
                {o}
                {pick !== null && k === q.correctIndex && (
                  <CheckCircle2 className="size-5 text-success" />
                )}
                {pick === k && k !== q.correctIndex && (
                  <XCircle className="size-5 text-destructive" />
                )}
              </button>
            ))}
          </div>
          {pick !== null && (
            <div className="mt-5 rounded-xl bg-muted p-4 text-sm">
              <span className="font-medium">Explanation: </span>
              {q.explanation}
            </div>
          )}
          <div className="mt-6 flex justify-end">
            <Button onClick={next} disabled={pick === null}>
              {i + 1 === qs.length ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </Page>
  );
}
