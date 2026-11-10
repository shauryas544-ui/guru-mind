import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/app-shell";
import { listMistakes } from "@/lib/tutor.functions";
import { computeConcepts } from "@/lib/learner-stats";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";

export const Route = createFileRoute("/_authenticated/learner-model")({
  head: () => ({
    meta: [
      { title: "Learner Model — Guru Mind" },
      { name: "description", content: "Concepts you've been corrected on." },
    ],
  }),
  component: LearnerModel,
});

const tone: Record<string, string> = {
  known: "bg-success-soft text-success",
  weak: "bg-warning-soft text-warning",
  unknown: "bg-destructive-soft text-destructive",
  Improving: "bg-sky-soft text-sky",
  "Needs work": "bg-warning-soft text-warning",
};

function LearnerModel() {
  const { data: modelRows = [] } = useQuery({
    queryKey: ["learner-model"],
    queryFn: () => api.getLearnerModel(),
  });
  const { data: mistakes = [] } = useQuery({
    queryKey: ["mistakes"],
    queryFn: () => listMistakes(),
  });

  const normalized = modelRows.length
    ? modelRows.map((c) => ({
        name: c.concept,
        errors: c.error_count,
        last: c.last_practiced,
        status: c.status,
        confidence: Math.round(Number(c.confidence) * 100),
        confusionNote: c.confusion_note,
        nextReview: c.next_review_at,
      }))
    : computeConcepts(mistakes).map((c) => ({
        name: c.name,
        errors: c.errors,
        last: c.last,
        status: c.status,
        confidence: c.status === "Needs work" ? 45 : 70,
        confusionNote: "",
        nextReview: null as string | null,
      }));

  const [selName, setSel] = useState<string | null>(null);
  const sel = normalized.find((c) => c.name === selName) ?? normalized[0];

  return (
    <Page>
      <PageHeader
        title="Your Learner Model"
        subtitle="Concept-level mastery built from your real sessions and verified memory."
      />
      {!sel ? (
        <section className="surface p-6 text-sm text-muted-foreground">
          Abhi koi data nahi hai.{" "}
          <Link to="/tutor" className="font-medium text-primary">
            Chat with your tutor
          </Link>{" "}
          — every concept you practise will show up here.
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-4">Concept</th>
                  <th className="p-4">Confidence</th>
                  <th className="p-4">Mistakes</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {normalized.map((c) => (
                  <tr
                    key={c.name}
                    onClick={() => setSel(c.name)}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50",
                      sel.name === c.name && "bg-primary-soft",
                    )}
                  >
                    <td className="p-4 font-medium">{c.name}</td>
                    <td className="p-4">{c.confidence}%</td>
                    <td className="p-4">{c.errors}</td>
                    <td className="p-4">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                          tone[c.status] ?? "bg-muted",
                        )}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="surface h-fit p-6">
            <h2 className="text-xl font-semibold">{sel.name}</h2>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Confidence</dt>
                <dd className="font-semibold">{sel.confidence}%</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Times corrected</dt>
                <dd className="font-semibold">{sel.errors}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last practised</dt>
                <dd className="font-semibold">{new Date(sel.last).toLocaleDateString()}</dd>
              </div>
              {sel.nextReview && (
                <div>
                  <dt className="text-muted-foreground">Next review</dt>
                  <dd className="font-semibold">{new Date(sel.nextReview).toLocaleDateString()}</dd>
                </div>
              )}
            </dl>
            {sel.confusionNote && (
              <p className="mt-4 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                {sel.confusionNote}
              </p>
            )}
            <div className="mt-6 rounded-xl bg-primary-soft p-4 text-sm">
              <p className="flex items-center gap-2 font-medium text-primary">
                <Lightbulb className="size-4" /> Recommendation
              </p>
              <p className="mt-1">
                Spend 10 minutes with the tutor on {sel.name}, then try a short adaptive quiz.
              </p>
            </div>
            <Button asChild className="mt-4 w-full">
              <Link to="/tutor">Practise with tutor</Link>
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}
