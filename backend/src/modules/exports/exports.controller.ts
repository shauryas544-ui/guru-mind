import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { getAdminSupabaseClient } from "../../config/database";
import { clearTokenVerificationCache } from "../../middleware/authenticate";
import { requireAuthContext } from "../../middleware/authorize";

export const RequestExportSchema = z.object({
  format: z.enum(["json", "markdown", "html"]).default("json"),
});

export async function requestExport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const body = (req.body ?? {}) as z.infer<typeof RequestExportSchema>;

    const [profileRes, sessionsRes, messagesRes, notesRes, conceptsRes, mistakesRes, patternsRes, capsulesRes] =
      await Promise.all([
        auth.supabase.from("profiles").select("*").eq("id", auth.userId).maybeSingle(),
        auth.supabase.from("learning_sessions").select("*").eq("user_id", auth.userId).order("started_at", { ascending: false }),
        auth.supabase.from("messages").select("*").eq("user_id", auth.userId).order("created_at", { ascending: true }),
        auth.supabase.from("constant_notes").select("*").eq("user_id", auth.userId).order("created_at", { ascending: false }),
        auth.supabase.from("learner_concepts").select("*").eq("user_id", auth.userId),
        auth.supabase.from("mistakes").select("*").eq("user_id", auth.userId).order("created_at", { ascending: false }),
        auth.supabase.from("mistake_patterns").select("*").eq("user_id", auth.userId),
        auth.supabase.from("time_capsules").select("*").eq("user_id", auth.userId),
      ]);

    const exportBundle = {
      exportedAt: new Date().toISOString(),
      profile: profileRes.data ?? null,
      sessions: sessionsRes.data ?? [],
      messages: messagesRes.data ?? [],
      constantNotes: notesRes.data ?? [],
      learnerModel: conceptsRes.data ?? [],
      mistakes: mistakesRes.data ?? [],
      mistakePatterns: patternsRes.data ?? [],
      timeCapsules: capsulesRes.data ?? [],
    };

    if (body.format === "markdown") {
      const md = [
        `# Guru Mind — Learning Data Export`,
        `Exported: ${exportBundle.exportedAt}`,
        `Learner: ${exportBundle.profile?.full_name || auth.email}`,
        ``,
        `## Learner Model (${exportBundle.learnerModel.length} concepts)`,
        ...exportBundle.learnerModel.map(
          (c: { concept: string; status: string; confidence: number }) =>
            `- **${c.concept}**: ${c.status} (${Math.round(Number(c.confidence) * 100)}%)`,
        ),
        ``,
        `## Constant Notes (${exportBundle.constantNotes.length})`,
        ...exportBundle.constantNotes.map(
          (n: { title: string; tag: string; content: string }) =>
            `### [${n.tag}] ${n.title}\n${n.content}`,
        ),
        ``,
        `## Mistakes (${exportBundle.mistakes.length})`,
        ...exportBundle.mistakes.map(
          (m: { original_text: string; corrected_text: string; concept: string; root_cause: string }) =>
            `- ~~${m.original_text}~~ -> **${m.corrected_text}** (${m.concept}: ${m.root_cause})`,
        ),
      ].join("\n");

      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="guru-mind-export.md"');
      res.send(md);
      return;
    }

    if (body.format === "html") {
      const escapeHtml = (s: unknown) =>
        String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Guru Mind Learning Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 820px; margin: 2rem auto; padding: 0 1rem; color: #1e1b4b; }
    h1, h2 { color: #312e81; }
    .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 1rem; margin: 0.75rem 0; }
    .bad { color: #be123c; text-decoration: line-through; }
    .good { color: #047857; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Guru Mind — Personal Learning Export</h1>
  <p>Exported on ${escapeHtml(exportBundle.exportedAt)} · Target Language: ${escapeHtml(exportBundle.profile?.learning_language || "English")}</p>
  <h2>Learner Model</h2>
  ${exportBundle.learnerModel
    .map(
      (c: { concept: string; status: string; confidence: number }) =>
        `<div class="card"><strong>${escapeHtml(c.concept)}</strong> — ${escapeHtml(c.status)} (${Math.round(Number(c.confidence) * 100)}%)</div>`,
    )
    .join("")}
  <h2>Constant Notes</h2>
  ${exportBundle.constantNotes
    .map(
      (n: { title: string; tag: string; content: string }) =>
        `<div class="card"><small>${escapeHtml(n.tag)}</small><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.content)}</p></div>`,
    )
    .join("")}
  <h2>Mistake Museum</h2>
  ${exportBundle.mistakes
    .map(
      (m: { original_text: string; corrected_text: string; explanation: string; root_cause: string }) =>
        `<div class="card"><div class="bad">${escapeHtml(m.original_text)}</div><div class="good">${escapeHtml(m.corrected_text)}</div><p>${escapeHtml(m.explanation)}</p><small>Root cause: ${escapeHtml(m.root_cause)}</small></div>`,
    )
    .join("")}
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="guru-mind-report.html"');
      res.send(html);
      return;
    }

    res.json({ success: true, data: exportBundle });
  } catch (err) {
    next(err);
  }
}

export async function deleteLearningHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);

    // Delete in dependency-safe order within RLS scope
    await Promise.all([
      auth.supabase.from("messages").delete().eq("user_id", auth.userId),
      auth.supabase.from("mistakes").delete().eq("user_id", auth.userId),
      auth.supabase.from("mistake_patterns").delete().eq("user_id", auth.userId),
      auth.supabase.from("learner_concepts").delete().eq("user_id", auth.userId),
      auth.supabase.from("constant_notes").delete().eq("user_id", auth.userId),
      auth.supabase.from("memory_cards").delete().eq("user_id", auth.userId),
      auth.supabase.from("time_capsules").delete().eq("user_id", auth.userId),
      auth.supabase.from("reports").delete().eq("user_id", auth.userId),
    ]);
    await auth.supabase.from("learning_sessions").delete().eq("user_id", auth.userId);

    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

export async function deleteUserAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);
    const admin = getAdminSupabaseClient();

    // Cascade deletes profile and all owned learning records via FK ON DELETE CASCADE
    const { error } = await admin.auth.admin.deleteUser(auth.userId);
    if (error) throw new Error(error.message);

    clearTokenVerificationCache(auth.token);
    res.json({ success: true, data: { accountDeleted: true } });
  } catch (err) {
    next(err);
  }
}

