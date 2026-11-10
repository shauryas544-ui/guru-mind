import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Page, PageHeader } from "@/components/app-shell";
import { getTutorHistory, listMistakes } from "@/lib/tutor.functions";
import { computeConcepts, computeWeek } from "@/lib/learner-stats";
import { api } from "@/services/api";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Guru Mind" },
      { name: "description", content: "Your weekly learning report." },
    ],
  }),
  component: Reports,
});

function Reports() {
  const { data: weekly } = useQuery({
    queryKey: ["weekly-report"],
    queryFn: () => api.getWeeklyReport(),
  });
  const { data: history = [] } = useQuery({
    queryKey: ["tutor"],
    queryFn: () => getTutorHistory(),
  });
  const { data: mistakes = [] } = useQuery({
    queryKey: ["mistakes"],
    queryFn: () => listMistakes(),
  });

  const week = weekly?.analytics?.dailyBreakdown ?? computeWeek(history);
  const maxMsg = Math.max(1, ...week.map((d) => d.messages));
  const total = week.reduce((a, d) => a + d.messages, 0);
  const weekAgo = Date.now() - 7 * 864e5;
  const recent =
    weekly?.analytics?.topConcepts.map((c) => ({ name: c.concept, errors: c.errors })) ??
    computeConcepts(mistakes.filter((m) => new Date(m.created_at).getTime() > weekAgo));

  const sessionReports = weekly?.recentSessionReports ?? [];
  const summaryStats = [
    { label: "Sessions this week", value: String(weekly?.analytics?.sessionsCount ?? 0) },
    {
      label: "Weekly accuracy",
      value:
        weekly?.analytics?.accuracyPercent === null ||
        weekly?.analytics?.accuracyPercent === undefined
          ? "—"
          : `${weekly.analytics.accuracyPercent}%`,
    },
    { label: "Concepts due for review", value: String(weekly?.analytics?.dueForReviewCount ?? 0) },
    { label: "Time Capsules ready", value: String(weekly?.analytics?.dueTimeCapsulesCount ?? 0) },
  ];

  return (
    <Page>
      <PageHeader
        title="Progress Reports"
        subtitle="A clear view of your last 7 days — real activity only."
      />
      {weekly?.analytics && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryStats.map((s) => (
            <div key={s.label} className="surface p-5">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>
      )}
      {total === 0 ? (
        <section className="surface p-6 text-sm text-muted-foreground">
          No activity in the last 7 days.{" "}
          <Link to="/tutor" className="font-medium text-primary">
            Start a session
          </Link>{" "}
          and your report will build up here.
        </section>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="surface p-6">
              <h2 className="font-semibold">Messages per day</h2>
              <div className="mt-6 flex h-48 items-end gap-3">
                {week.map((d, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-xs text-muted-foreground">{d.messages}</span>
                    <div
                      className="w-full rounded-t-lg bg-brand"
                      style={{ height: `${(d.messages / maxMsg) * 150}px` }}
                    />
                    <span className="text-xs text-muted-foreground">{d.day}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="surface p-6">
              <h2 className="font-semibold">Answers without mistakes</h2>
              <div className="mt-6 flex h-48 items-end gap-3">
                {week.map((d, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {d.accuracy === null ? "—" : `${d.accuracy}%`}
                    </span>
                    <div
                      className="w-full rounded-t-lg bg-sky"
                      style={{ height: `${((d.accuracy ?? 0) / 100) * 150}px` }}
                    />
                    <span className="text-xs text-muted-foreground">{d.day}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="surface p-6">
            <h2 className="font-semibold">This week's tricky concepts</h2>
            {recent.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No corrections this week. Great work!
              </p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {recent.map((c) => (
                  <li key={c.name} className="rounded-full bg-warning-soft px-3 py-1 text-sm">
                    {c.name} · {c.errors}×
                  </li>
                ))}
              </ul>
            )}
          </section>
          {sessionReports.length > 0 && (
            <section className="surface p-6">
              <h2 className="font-semibold">Recent End-of-Session Reviews</h2>
              <div className="mt-4 space-y-4">
                {sessionReports.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border p-4 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                    <p className="mt-1">{r.summary.summary}</p>
                    <p className="mt-2 text-xs text-primary">Homework: {r.summary.homework}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Page>
  );
}
