import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Flame,
  BookOpen,
  Target,
  MessageSquare,
  ArrowRight,
  GraduationCap,
  Compass,
  Dumbbell,
  Landmark,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page, useProfile } from "@/components/app-shell";
import { getTutorHistory, listMistakes } from "@/lib/tutor.functions";
import { computeAccuracy, computeConcepts, computeStreak } from "@/lib/learner-stats";
import { api } from "@/services/api";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Guru Mind" },
      { name: "description", content: "Your learning at a glance." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: profile } = useProfile();
  const { data: mistakes = [] } = useQuery({
    queryKey: ["mistakes"],
    queryFn: () => listMistakes(),
  });
  const { data: history = [] } = useQuery({
    queryKey: ["tutor"],
    queryFn: () => getTutorHistory(),
  });
  const { data: learnerModel = [] } = useQuery({
    queryKey: ["learner-model"],
    queryFn: () => api.getLearnerModel(),
  });
  const { data: weekly } = useQuery({
    queryKey: ["weekly-report"],
    queryFn: () => api.getWeeklyReport(),
  });
  const first = (profile?.full_name ?? "").split(" ")[0];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const streak = computeStreak(history);
  const accuracy = computeAccuracy(history);
  const concepts = computeConcepts(mistakes);
  const sent = history.filter((m) => m.role === "user").length;
  const weakest = concepts[0];
  const weakModelConcept = learnerModel.find((c) => c.status !== "known");
  const dueReviewCount = weekly?.analytics?.dueForReviewCount ?? 0;
  const dueCapsuleCount = weekly?.analytics?.dueTimeCapsulesCount ?? 0;
  const empty = sent === 0;

  const stats = [
    {
      icon: Flame,
      label: "Learning streak",
      value: `${streak} ${streak === 1 ? "day" : "days"}`,
      tone: "bg-warning-soft text-warning",
    },
    {
      icon: MessageSquare,
      label: "Messages to tutor",
      value: String(sent),
      tone: "bg-primary-soft text-primary",
    },
    {
      icon: Target,
      label: "Answers without mistakes",
      value: accuracy === null ? "—" : `${accuracy}%`,
      tone: "bg-success-soft text-success",
    },
    {
      icon: BookOpen,
      label: "Concepts tracked",
      value: String(Math.max(learnerModel.length, concepts.length)),
      tone: "bg-sky-soft text-sky",
    },
  ];

  return (
    <Page>
      <div className="surface relative overflow-hidden p-7">
        <div className="absolute inset-0 bg-glow" aria-hidden />
        <div className="relative">
          <p className="text-sm text-muted-foreground">{today}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">
            Welcome{empty ? "" : " back"}
            {first ? `, ${first}` : ""}!
          </h1>
          <p className="mt-2 text-muted-foreground">
            {empty
              ? "Abhi koi session record nahi hua — pehla session shuru karein!"
              : profile?.goal
                ? `Goal: ${profile.goal}`
                : "Small steps, every day."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="surface p-5">
            <span
              className={`inline-flex size-10 items-center justify-center rounded-xl ${s.tone}`}
            >
              <s.icon className="size-5" />
            </span>
            <p className="mt-4 text-sm text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="surface p-6">
          <h2 className="text-lg font-semibold">What to do next</h2>
          {empty ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Start with a short chat with your tutor or mentor. Your real progress will appear
              here.
            </p>
          ) : weakModelConcept || weakest ? (
            <div className="mt-4 space-y-3 text-sm">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 text-warning" />
                Focus area: <b>{weakModelConcept?.concept || weakest?.name}</b>
                {weakest ? ` (${weakest.errors}×)` : ""}
              </p>
              <p className="flex items-start gap-2">
                <Lightbulb className="mt-0.5 size-4 text-primary" />
                Ask your tutor to explain {weakModelConcept?.concept || weakest?.name} with everyday
                examples.
              </p>
              {(dueReviewCount > 0 || dueCapsuleCount > 0) && (
                <p className="rounded-lg bg-primary-soft px-3 py-2 text-xs text-primary">
                  {dueReviewCount > 0
                    ? `${dueReviewCount} concept(s) due for spaced repetition review. `
                    : ""}
                  {dueCapsuleCount > 0 ? `${dueCapsuleCount} Time Capsule(s) ready to open!` : ""}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No mistakes found yet — keep chatting to find what to improve.
            </p>
          )}
          <Button asChild className="mt-5">
            <Link to="/tutor">
              {empty ? "Start first session" : "Continue learning"} <ArrowRight />
            </Link>
          </Button>
        </section>
        <section className="surface p-6">
          <h2 className="font-semibold">Quick actions</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {(
              [
                { to: "/tutor", l: "Ask Tutor", i: GraduationCap },
                { to: "/mentor", l: "Talk to Mentor", i: Compass },
                { to: "/practice", l: "Start Practice", i: Dumbbell },
                { to: "/mistakes", l: "Review Mistakes", i: Landmark },
              ] as const
            ).map((q) => (
              <Link
                key={q.l}
                to={q.to}
                className="flex flex-col gap-2 rounded-xl border border-border p-3.5 text-sm font-medium transition-colors hover:bg-primary-soft"
              >
                <q.i className="size-5 text-primary" />
                {q.l}
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="surface p-6">
        <h2 className="text-lg font-semibold">Recent corrections</h2>
        {mistakes.length > 0 ? (
          <ul className="mt-4 divide-y divide-border">
            {mistakes.slice(0, 5).map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <span>
                  <span className="text-destructive line-through">{m.original}</span> →{" "}
                  <span className="font-medium text-success">{m.corrected}</span>
                </span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{m.concept}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No corrections yet.{" "}
            <Link to="/tutor" className="font-medium text-primary">
              Chat with your tutor
            </Link>{" "}
            and they'll appear here.
          </p>
        )}
      </section>
    </Page>
  );
}
