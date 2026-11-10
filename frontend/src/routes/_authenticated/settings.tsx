import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Page, PageHeader, useProfile } from "@/components/app-shell";
import {
  EXPLAIN_LANGUAGES,
  LEARN_LANGUAGES,
  NATIVE_LANGUAGES,
  getExplainLanguage,
  setExplainLanguage,
  type ExplainLanguage,
} from "@/lib/language";
import { api } from "@/services/api";
import type { LearnerLevel } from "@/types/api";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Guru Mind" },
      { name: "description", content: "Profile and learning preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: profile } = useProfile();
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: () => api.health() });
  const { data: voiceConfig } = useQuery({
    queryKey: ["voice-config"],
    queryFn: () => api.getVoiceConfig(),
  });
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [nativeLang, setNativeLang] = useState("Hindi");
  const [level, setLevel] = useState<LearnerLevel>("Beginner");
  const [learn, setLearn] = useState("English");
  const [goal, setGoal] = useState("");
  const [explain, setExplain] = useState<ExplainLanguage>("Hinglish");
  const [voicePref, setVoicePref] = useState("Shivani");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? "");
      setNativeLang(profile.native_language || "Hindi");
      setLevel(profile.level ?? "Beginner");
      setLearn(profile.learning_language || "English");
      setGoal(profile.goal ?? "");
      setVoicePref(profile.voice_preference || "Shivani");
      if (profile.explain_language) {
        setExplain(profile.explain_language);
      }
    }
  }, [profile]);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    if (!profile?.explain_language) setExplain(getExplainLanguage());
  }, [profile?.explain_language]);

  async function save() {
    try {
      await api.updateProfile({
        full_name: name.trim(),
        native_language: nativeLang,
        level,
        learning_language: learn,
        goal: goal.trim(),
        explain_language: explain,
        voice_preference: voicePref,
      });
      setExplainLanguage(explain);
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings.");
    }
  }

  const voices = voiceConfig?.voices ?? [
    { id: "Shivani", label: "Shivani (Warm, Clear)", gender: "Female" },
  ];

  return (
    <Page>
      <PageHeader
        title="Settings"
        subtitle="Personalise your tutor, mentor voice, and learning goals."
      />
      <section className="surface max-w-2xl space-y-5 p-6">
        <h2 className="font-semibold">Profile</h2>
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={profile?.email ?? ""} disabled />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Native language</Label>
            <Select value={nativeLang} onValueChange={setNativeLang}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NATIVE_LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Language I want to learn</Label>
            <Select value={learn} onValueChange={setLearn}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEARN_LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Current level</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as LearnerLevel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["Beginner", "Intermediate", "Advanced"] as const).map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Explain things to me in</Label>
            <Select value={explain} onValueChange={(v) => setExplain(v as ExplainLanguage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPLAIN_LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Learning goal</Label>
          <Input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g., Speak confidently in job interviews and daily meetings"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Gnani Voice AI Mentor Voice</Label>
          <Select value={voicePref} onValueChange={setVoicePref}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {voices.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save}>Save changes</Button>
      </section>

      <section className="surface max-w-2xl space-y-3 p-6">
        <h2 className="font-semibold">AI Provider Status (Server-side)</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-border p-3.5">
            <p className="text-xs text-muted-foreground">Gemini AI (Tutor & Mentor)</p>
            <p className="mt-1 font-medium">
              {health?.providers.geminiConfigured
                ? `Connected (${health.providers.geminiModel})`
                : "Key not set"}
            </p>
          </div>
          <div className="rounded-xl border border-border p-3.5">
            <p className="text-xs text-muted-foreground">Gnani AI (Speech & Voice)</p>
            <p className="mt-1 font-medium">
              {health?.providers.gnaniConfigured
                ? `Connected (${health.providers.gnaniSttModel} / ${health.providers.gnaniTtsModel})`
                : "Key not set (browser fallback active)"}
            </p>
          </div>
        </div>
      </section>

      <section className="surface max-w-2xl space-y-4 p-6">
        <h2 className="font-semibold">Appearance</h2>
        <label className="flex items-center justify-between text-sm">
          Dark mode
          <Switch
            checked={dark}
            onCheckedChange={(v) => {
              setDark(v);
              document.documentElement.classList.toggle("dark", v);
            }}
          />
        </label>
      </section>
    </Page>
  );
}
