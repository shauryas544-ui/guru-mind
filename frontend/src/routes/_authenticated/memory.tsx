import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookMarked, History, CreditCard, Plus } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Page, PageHeader, SampleBadge } from "@/components/app-shell";
import { memoryNotes } from "@/lib/sample-data";
import { getTutorHistory } from "@/lib/tutor.functions";
import { api } from "@/services/api";

export const Route = createFileRoute("/_authenticated/memory")({
  head: () => ({
    meta: [
      { title: "Learning Memory — Guru Mind" },
      { name: "description", content: "Your key lessons and learning history." },
    ],
  }),
  component: Memory,
});

function Memory() {
  const qc = useQueryClient();
  const { data: history = [] } = useQuery({
    queryKey: ["tutor"],
    queryFn: () => getTutorHistory(),
  });
  const { data: realNotes = [], isLoading: notesLoading } = useQuery({
    queryKey: ["constant-notes"],
    queryFn: () => api.listConstantNotes(),
  });
  const { data: cards = [] } = useQuery({
    queryKey: ["memory-cards"],
    queryFn: () => api.listMemoryCards(),
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.listSessions(),
  });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tag, setTag] = useState("Grammar");

  const addNote = useMutation({
    mutationFn: () => api.addConstantNote({ title: title.trim(), content: content.trim(), tag }),
    onSuccess: () => {
      setTitle("");
      setContent("");
      qc.invalidateQueries({ queryKey: ["constant-notes"] });
      toast.success("Note saved to Constant Notes.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save note."),
  });

  const snapshotCard = useMutation({
    mutationFn: () => api.createMemoryCard(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memory-cards"] });
      toast.success("Memory Card snapshot created.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create memory card."),
  });

  const usingSampleNotes = !notesLoading && realNotes.length === 0;
  const shownNotes = usingSampleNotes
    ? memoryNotes.map((n, i) => ({
        id: `sample-${i}`,
        title: n.title,
        content: n.content,
        tag: n.tag,
        created_at: n.date,
      }))
    : realNotes;
  const userMsgs = history.filter((m) => m.role === "user").reverse();

  return (
    <Page>
      <PageHeader
        title="Learning Memory"
        subtitle="Three separate layers: Constant Notes, Raw History, and compact Memory Cards."
        action={usingSampleNotes ? <SampleBadge /> : undefined}
      />

      <Tabs defaultValue="notes">
        <TabsList>
          <TabsTrigger value="notes">
            <BookMarked /> Constant notes
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> Learning history
          </TabsTrigger>
          <TabsTrigger value="cards">
            <CreditCard /> Memory cards
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="mt-6 space-y-6">
          <div className="surface space-y-3 p-5">
            <p className="font-semibold">Add a personal learning note</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (e.g., Present Simple rule)"
              />
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag" />
            </div>
            <Textarea
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write what you want to remember…"
            />
            <Button
              size="sm"
              disabled={!title.trim() || !content.trim() || addNote.isPending}
              onClick={() => addNote.mutate()}
            >
              <Plus /> Save note
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {shownNotes.map((n) => (
              <div key={n.id} className="surface p-5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">
                    {n.tag}
                  </span>
                  <span>
                    {usingSampleNotes ? n.created_at : new Date(n.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold">{n.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{n.content}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6 space-y-6">
          {sessions.length > 0 && (
            <div className="surface p-5">
              <h3 className="font-semibold">Recent sessions</h3>
              <div className="mt-3 divide-y divide-border">
                {sessions.slice(0, 8).map((s) => (
                  <div key={s.id} className="py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">
                        {s.mode} · {s.language}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(s.started_at).toLocaleDateString()}
                      </span>
                    </div>
                    {s.summary && <p className="mt-1 text-xs text-muted-foreground">{s.summary}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="surface divide-y divide-border">
            {userMsgs.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">
                Your tutor conversations will appear here.
              </p>
            )}
            {userMsgs.slice(0, 40).map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                <span className="truncate">{m.content}</span>
                <span className="shrink-0 text-xs text-muted-foreground capitalize">
                  {m.mode} · {new Date(m.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="cards" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Compact snapshots of your strengths, weak concepts, and patterns.
            </p>
            <Button
              size="sm"
              onClick={() => snapshotCard.mutate()}
              disabled={snapshotCard.isPending}
            >
              Create snapshot
            </Button>
          </div>
          {cards.length === 0 ? (
            <div className="surface p-6 text-sm text-muted-foreground">
              No memory card snapshots yet. Click "Create snapshot" or end a Tutor session to
              generate one.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {cards.map((card) => (
                <div key={card.id} className="surface space-y-2 p-5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {card.language} Memory Card v{card.version}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(card.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {card.card_content.strengths && card.card_content.strengths.length > 0 && (
                    <p className="text-xs text-success">
                      Strengths: {card.card_content.strengths.join(", ")}
                    </p>
                  )}
                  {card.card_content.focusAreas && card.card_content.focusAreas.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Focus: {card.card_content.focusAreas.map((f) => f.concept).join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Page>
  );
}
