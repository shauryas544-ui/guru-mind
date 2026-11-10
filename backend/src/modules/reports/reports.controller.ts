import type { NextFunction, Request, Response } from "express";
import { isMissingSchemaError } from "../../config/database";
import { requireAuthContext } from "../../middleware/authorize";
import { buildWeeklyReportData } from "../../services/scheduler/schedulerService";

export async function getWeeklyReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = requireAuthContext(req);

    const [analytics, sessionReportsRes] = await Promise.all([
      buildWeeklyReportData(auth.supabase, auth.userId),
      auth.supabase
        .from("reports")
        .select("*")
        .eq("user_id", auth.userId)
        .eq("report_type", "session")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (sessionReportsRes.error && !isMissingSchemaError(sessionReportsRes.error)) {
      throw new Error(sessionReportsRes.error.message);
    }

    res.json({
      success: true,
      data: {
        analytics,
        recentSessionReports: sessionReportsRes.data ?? [],
      },
    });
  } catch (err) {
    next(err);
  }
}

