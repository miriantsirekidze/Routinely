import { db } from "./client";
import { days, sessions, subActivities, pauses } from "./schema";
import { asc, eq } from "drizzle-orm";
import { getTodayDate } from "../utils/time";

export async function generateFullExportCsv(): Promise<string> {
  const allDays = await db.select().from(days).orderBy(asc(days.date));

  const headers = [
    "date",
    "session_name",
    "sub_activity_name",
    "elapsed_seconds",
    "elapsed_formatted",
    "expected_seconds",
    "start_time",
    "end_time",
    "pause_duration_seconds",
    "pause_reasons",
  ];

  const rows: string[] = [headers.join(",")];

  for (const day of allDays) {
    const daySessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.dayId, day.id))
      .orderBy(asc(sessions.sortOrder));

    for (const s of daySessions) {
      if (!s.endedAt) continue;

      const subs = await db
        .select()
        .from(subActivities)
        .where(eq(subActivities.sessionId, s.id))
        .orderBy(asc(subActivities.sortOrder));

      for (const sa of subs) {
        const subPauses = await db
          .select()
          .from(pauses)
          .where(eq(pauses.subActivityId, sa.id));

        const elapsedSec = Math.round((sa.elapsedMs ?? 0) / 1000);
        const min = Math.floor(elapsedSec / 60);
        const sec = elapsedSec % 60;
        const formatted = `${min}:${String(sec).padStart(2, "0")}`;

        const expectedSec = sa.expectedDuration ?? "";
        const startTime = sa.startedAt
          ? new Date(sa.startedAt).toLocaleTimeString("en-US", {
              hour12: false,
            })
          : "";
        const endTime = sa.endedAt
          ? new Date(sa.endedAt).toLocaleTimeString("en-US", {
              hour12: false,
            })
          : "";

        const totalPauseSec = Math.round(
          subPauses.reduce((sum, p) => sum + (p.durationMs ?? 0), 0) / 1000
        );
        const pauseReasons = subPauses
          .filter((p) => p.reason)
          .map((p) => p.reason)
          .join("; ");

        const row = [
          day.date,
          quote(s.name),
          quote(sa.name),
          elapsedSec,
          formatted,
          expectedSec,
          startTime,
          endTime,
          totalPauseSec || "",
          pauseReasons ? quote(pauseReasons) : "",
        ];

        rows.push(row.join(","));
      }
    }
  }

  return rows.join("\n");
}

export async function generateFullExportJson(): Promise<string> {
  const allDays = await db.select().from(days).orderBy(asc(days.date));
  const exportData: any[] = [];

  for (const day of allDays) {
    const daySessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.dayId, day.id))
      .orderBy(asc(sessions.sortOrder));

    const sessionData: any[] = [];

    for (const s of daySessions) {
      if (!s.endedAt) continue;

      const subs = await db
        .select()
        .from(subActivities)
        .where(eq(subActivities.sessionId, s.id))
        .orderBy(asc(subActivities.sortOrder));

      const subData = [];
      for (const sa of subs) {
        const subPauses = await db
          .select()
          .from(pauses)
          .where(eq(pauses.subActivityId, sa.id));

        subData.push({
          name: sa.name,
          elapsedMs: sa.elapsedMs,
          expectedDuration: sa.expectedDuration,
          startedAt: sa.startedAt,
          endedAt: sa.endedAt,
          pauses: subPauses.map((p) => ({
            durationMs: p.durationMs,
            reason: p.reason,
          })),
        });
      }

      sessionData.push({
        name: s.name,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        expectedDuration: s.expectedDuration,
        subActivities: subData,
      });
    }

    exportData.push({
      date: day.date,
      finishedAt: day.finishedAt,
      sessions: sessionData,
    });
  }

  return JSON.stringify(exportData, null, 2);
}

function quote(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
