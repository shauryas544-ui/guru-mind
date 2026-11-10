import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/app-shell";
import { listMistakes } from "@/lib/tutor.functions";
import { sampleMistakes } from "@/lib/sample-data";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";

export const Route = createFileRoute("/_authenticated/mistakes")({
  head: () => ({
    meta: [
      { title: "Mistake Museum — Guru Mind" },
      { name: "description", content: "Every mistake, its root cause, and your progress." },
    ],
  }),
  component: Mistakes,
});

type Row = {
  original: string;
  corrected: string;
  concept: string;
  root_cause: string;
  explanation?: string;
  count?: number;
  status?: string;
};

function Mistakes() {
  const { data, isLoading } = useQuery({ queryKey: ["mistakes"], queryFn: () => listMistakes() });
  const { data: patterns = [] } = useQuery({
    queryKey: ["mistake-patterns"],
    queryFn: () => api.listMistakePatterns(),
  });
  const real: Row[] = data ?? [];
  const usingSample = !isLoading && real.length === 0;
  const rows: Row[] = usingSample ? sampleMistakes : real;
  const [filter, setFilter] = useState("All");
  const cats = ["All", ...Array.from(new Set(rows.map((r) => r.concept)))];
  const shown = filter === "All" ? rows : rows.filter((r) => r.concept === filter);

  const causes: Array<[string, number]> = patterns.length
    ? patterns.slice(0, 4).map((p) => [p.pattern_key, p.occurrence_count])
    : Object.entries(
        rows.reduce<Record<string, number>>((a, r) => {
          a[r.root_cause] = (a[r.root_cause] ?? 0) + (r.count ?? 1);
          return a;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
  const max = causes[0]?.[1] ?? 1;

  return (
    <Page>
      <PageHeader
        title="Mistake Museum"
        subtitle="Mistakes are exhibits, not failures. Each one teaches you something."
        action={
          usingSample ? (
            <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium">
              Sample data — chat with the tutor to fill this
            </span>
          ) : undefined
        }
      />

      <section className="surface p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Fingerprint className="size-5 text-primary" /> Your Mistake Fingerprint
        </h2>
        <p className="text-sm text-muted-foreground">
          The root causes behind most of your mistakes.
        </p>
        <ul className="mt-5 space-y-3">
          {causes.map(([c, n]) => (
            <li key={c}>
              <div className="flex justify-between text-sm">
                <span>{c}</span>
                <span className="text-muted-foreground">{n}×</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              filter === c
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {shown.map((m, i) => (
          <div key={i} className="surface p-5">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs text-primary">
                {m.concept}
              </span>
              {m.status && (
                <span className="text-xs text-muted-foreground">
                  {m.status}
                  {m.count ? ` · seen ${m.count}×` : ""}
                </span>
              )}
            </div>
            <p className="mt-4 text-destructive line-through">{m.original}</p>
            <p className="font-medium text-success">{m.corrected}</p>
            {m.explanation && <p className="mt-2 text-sm text-muted-foreground">{m.explanation}</p>}
            <p className="mt-3 text-xs">
              <span className="text-muted-foreground">Root cause:</span> {m.root_cause}
            </p>
          </div>
        ))}
      </div>
      <Button asChild variant="outline">
        <Link to="/practice">Practise these mistakes</Link>
      </Button>
    </Page>
  );
}
