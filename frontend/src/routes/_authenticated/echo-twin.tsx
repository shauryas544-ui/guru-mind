import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Page, PageHeader } from "@/components/app-shell";
import { getTutorHistory, listMistakes } from "@/lib/tutor.functions";
import { computeAccuracy } from "@/lib/learner-stats";

export const Route = createFileRoute("/_authenticated/echo-twin")({
  head: () => ({
    meta: [
      { title: "Echo Twin — Guru Mind" },
      { name: "description", content: "Your past self vs your present self." },
    ],
  }),
  component: EchoTwin,
});

function EchoTwin() {
  const { data: history = [] } = useQuery({
    queryKey: ["tutor"],
    queryFn: () => getTutorHistory(),
  });
  const { data: mistakes = [] } = useQuery({
    queryKey: ["mistakes"],
    queryFn: () => listMistakes(),
  });
  const half = Math.floor(history.length / 2);
  const then = computeAccuracy(history.slice(0, half));
  const now = computeAccuracy(history.slice(half));
  const enough = history.length >= 10;

  return (
    <Page>
      <PageHeader
        title="Echo Twin"
        subtitle="Your earlier sentences next to the corrected versions."
      />
      {enough ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="surface p-6">
            <p className="text-sm text-muted-foreground">Your earlier sessions</p>
            <p className="mt-1 text-4xl font-bold">{then ?? "—"}%</p>
            <p className="text-sm text-muted-foreground">answers without mistakes</p>
          </div>
          <div className="surface bg-brand p-6 text-primary-foreground">
            <p className="text-sm opacity-80">Your recent sessions</p>
            <p className="mt-1 text-4xl font-bold">{now ?? "—"}%</p>
            <p className="text-sm opacity-80">answers without mistakes</p>
          </div>
        </div>
      ) : (
        <section className="surface p-6 text-sm text-muted-foreground">
          Have a few more conversations with your{" "}
          <Link to="/tutor" className="font-medium text-primary">
            tutor
          </Link>{" "}
          to compare your past and present self.
        </section>
      )}
      <section className="space-y-3">
        {mistakes.slice(0, 10).map((p) => (
          <div
            key={p.id}
            className="surface grid items-center gap-4 p-5 md:grid-cols-[1fr_auto_1fr]"
          >
            <div>
              <p className="text-xs text-muted-foreground">
                Then · {new Date(p.created_at).toLocaleDateString()}
              </p>
              <p className="text-destructive">{p.original}</p>
            </div>
            <ArrowRight className="hidden size-5 text-muted-foreground md:block" />
            <div>
              <p className="text-xs text-muted-foreground">Correct · {p.concept}</p>
              <p className="font-medium text-success">{p.corrected}</p>
            </div>
          </div>
        ))}
      </section>
    </Page>
  );
}
