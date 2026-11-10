import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Page, PageHeader } from "@/components/app-shell";
import { api } from "@/services/api";

export const Route = createFileRoute("/_authenticated/time-capsule")({
  head: () => ({
    meta: [
      { title: "Time Capsule — Guru Mind" },
      { name: "description", content: "Write to your future self." },
    ],
  }),
  component: TimeCapsule,
});

function TimeCapsule() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");
  const { data: caps = [] } = useQuery({
    queryKey: ["time-capsules"],
    queryFn: () => api.listTimeCapsules(),
  });

  const seal = useMutation({
    mutationFn: () => api.createTimeCapsule({ content: msg.trim(), daysFromNow: 30 }),
    onSuccess: () => {
      setMsg("");
      qc.invalidateQueries({ queryKey: ["time-capsules"] });
      toast.success("Capsule sealed — opens in 30 days.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not seal time capsule."),
  });

  const openCap = useMutation({
    mutationFn: (id: string) => api.openTimeCapsule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["time-capsules"] }),
  });

  return (
    <Page>
      <PageHeader
        title="Time Capsule"
        subtitle="Write a message and a sample sentence. Open it in 30 days to see how you've grown."
      />
      <section className="surface p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Mail className="size-4 text-primary" /> New capsule
        </h2>
        <Textarea
          className="mt-4"
          rows={4}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Dear future me, today I can say…"
        />
        <Button
          className="mt-3"
          disabled={!msg.trim() || seal.isPending}
          onClick={() => seal.mutate()}
        >
          {seal.isPending ? "Sealing…" : "Seal for 30 days"}
        </Button>
      </section>
      {caps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No capsules yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {caps.map((c) => {
            const isDue = new Date(c.reminder_at) <= new Date();
            if (isDue && c.opened_at) {
              return (
                <div key={c.id} className="surface p-6">
                  <p className="text-xs text-muted-foreground">
                    Sealed {new Date(c.created_at).toLocaleDateString()} · opened
                  </p>
                  <p className="mt-2 text-sm">"{c.content}"</p>
                </div>
              );
            }
            if (isDue && !c.opened_at) {
              return (
                <div
                  key={c.id}
                  className="surface flex flex-col items-center justify-center p-6 text-center"
                >
                  <Mail className="size-6 text-primary" />
                  <p className="mt-2 text-sm font-medium">Ready to open!</p>
                  <Button size="sm" className="mt-3" onClick={() => openCap.mutate(c.id)}>
                    Open capsule
                  </Button>
                </div>
              );
            }
            return (
              <div
                key={c.id}
                className="surface flex flex-col items-center justify-center p-6 text-center text-muted-foreground"
              >
                <Lock className="size-6" />
                <p className="mt-2 text-sm">
                  Sealed {new Date(c.created_at).toLocaleDateString()} · opens{" "}
                  {new Date(c.reminder_at).toLocaleDateString()}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
