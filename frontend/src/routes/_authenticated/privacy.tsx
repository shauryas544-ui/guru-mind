import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Page, PageHeader, useProfile } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { clearLocalMentorHistory } from "@/lib/mentor-history";
import { api } from "@/services/api";

export const Route = createFileRoute("/_authenticated/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — Guru Mind" },
      { name: "description", content: "Control your learning data." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: profile } = useProfile();

  async function downloadExport(format: "json" | "markdown" | "html") {
    try {
      const blob = await api.exportData(format);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const ext = format === "markdown" ? "md" : format;
      a.download = `guru-mind-export.${ext}`;
      a.click();
      toast.success(`Exported ${format.toUpperCase()} archive.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    }
  }

  async function toggleSaveHistory(enabled: boolean) {
    try {
      await api.updateProfile({ save_history: enabled });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(
        enabled
          ? "History saving enabled."
          : "Incognito learning enabled (messages won't be saved).",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update preference.");
    }
  }

  async function wipe() {
    if (!confirm("Delete your entire learning history, notes, and mistakes? This can't be undone."))
      return;
    try {
      await api.deleteHistory();
      clearLocalMentorHistory(profile?.id);
      qc.invalidateQueries();
      toast.success("Learning history deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function deleteAccount() {
    if (
      !confirm(
        "Permanently delete your Guru Mind account and ALL learning records? This cannot be undone.",
      )
    )
      return;
    try {
      await api.deleteAccount();
      clearLocalMentorHistory(profile?.id);
      await supabase.auth.signOut();
      qc.clear();
      toast.success("Account deleted.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Account deletion failed.");
    }
  }

  return (
    <Page>
      <PageHeader title="Privacy & data" subtitle="Your learning data belongs to you." />
      <div className="surface flex items-start gap-4 p-6">
        <ShieldCheck className="size-6 shrink-0 text-success" />
        <div className="flex-1 space-y-3">
          <p className="text-sm text-muted-foreground">
            Only you can see your conversations, mistakes, constant notes, and learner model. Your
            account is isolated via PostgreSQL Row Level Security. Sensitive secrets or personal IDs
            are filtered automatically.
          </p>
          <label className="flex items-center justify-between pt-2 text-sm font-medium">
            Save conversations and learning memory
            <Switch checked={profile?.save_history ?? true} onCheckedChange={toggleSaveHistory} />
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="surface p-6">
          <h2 className="font-semibold">Export your data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Download your sessions, constant notes, learner model, and mistakes.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadExport("json")}>
              <Download /> JSON
            </Button>
            <Button variant="outline" onClick={() => downloadExport("markdown")}>
              <Download /> Markdown
            </Button>
            <Button variant="outline" onClick={() => downloadExport("html")}>
              <Download /> Printable Report
            </Button>
          </div>
        </div>
        <div className="surface space-y-4 p-6">
          <div>
            <h2 className="font-semibold">Delete learning data</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Remove all conversations, notes, and mistake records while keeping your login.
            </p>
            <Button className="mt-3" variant="destructive" onClick={wipe}>
              <Trash2 /> Wipe history
            </Button>
          </div>
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Delete account permanently</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Deletes your authentication account and cascades all records.
            </p>
            <Button className="mt-3" variant="outline" onClick={deleteAccount}>
              Delete my account
            </Button>
          </div>
        </div>
      </div>
    </Page>
  );
}
