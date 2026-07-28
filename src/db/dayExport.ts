import { db } from "./client";
import { days, sessions, subActivities, pauses } from "./schema";
import { eq, asc } from "drizzle-orm";
import { getTodayDate } from "../utils/time";

export type DaySummary = {
  date: string;
  totalActiveMs: number;
  totalPauseMs: number;
  sessionCount: number;
  sessions: {
    name: string;
    totalMs: number;
    expectedDuration: number | null;
    subActivities: {
      name: string;
      elapsedMs: number;
      expectedDuration: number | null;
      startedAt: Date | null;
      endedAt: Date | null;
      pauses: {
        durationMs: number;
        reason: string | null;
      }[];
    }[];
  }[];
};

export async function getTodaySummary(): Promise<DaySummary | null> {
  const todayStr = getTodayDate();

  const dayRow = await db.query.days.findFirst({
    where: eq(days.date, todayStr),
  });

  if (!dayRow) return null;

  return getDateSummary(dayRow.id, todayStr);
}

export async function getSummaryForDate(dateStr: string): Promise<DaySummary | null> {
  const dayRow = await db.query.days.findFirst({
    where: eq(days.date, dateStr),
  });

  if (!dayRow) return null;

  return getDateSummary(dayRow.id, dateStr);
}

async function getDateSummary(
  dayId: number,
  date: string
): Promise<DaySummary> {
  const daySessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.dayId, dayId))
    .orderBy(asc(sessions.sortOrder));

  let totalActiveMs = 0;
  let totalPauseMs = 0;
  const sessionResults: DaySummary["sessions"] = [];

  for (const s of daySessions) {
    if (!s.endedAt) continue;

    const subs = await db
      .select()
      .from(subActivities)
      .where(eq(subActivities.sessionId, s.id))
      .orderBy(asc(subActivities.sortOrder));

    const subResults: DaySummary["sessions"][0]["subActivities"] = [];
    let sessionMs = 0;

    for (const sa of subs) {
      const subPauses = await db
        .select()
        .from(pauses)
        .where(eq(pauses.subActivityId, sa.id));

      const pauseMs = subPauses.reduce(
        (sum, p) => sum + (p.durationMs ?? 0),
        0
      );
      totalPauseMs += pauseMs;

      const elapsed = sa.elapsedMs ?? 0;
      sessionMs += elapsed;

      subResults.push({
        name: sa.name,
        elapsedMs: elapsed,
        expectedDuration: sa.expectedDuration,
        startedAt: sa.startedAt,
        endedAt: sa.endedAt,
        pauses: subPauses.map((p) => ({
          durationMs: p.durationMs ?? 0,
          reason: p.reason,
        })),
      });
    }

    totalActiveMs += sessionMs;

    sessionResults.push({
      name: s.name,
      totalMs: sessionMs,
      expectedDuration: s.expectedDuration,
      subActivities: subResults,
    });
  }

  return {
    date,
    totalActiveMs,
    totalPauseMs,
    sessionCount: sessionResults.length,
    sessions: sessionResults,
  };
}

export async function finishDay(): Promise<void> {
  const todayStr = getTodayDate();

  await db
    .update(days)
    .set({ finishedAt: new Date(), exported: true })
    .where(eq(days.date, todayStr));
}

export function generateCsv(summary: DaySummary): string {
  const headers = [
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

  for (const session of summary.sessions) {
    for (const sa of session.subActivities) {
      const elapsedSec = Math.round(sa.elapsedMs / 1000);
      const elapsedMin = Math.floor(elapsedSec / 60);
      const elapsedRemSec = elapsedSec % 60;
      const formatted = `${elapsedMin}:${String(elapsedRemSec).padStart(2, "0")}`;

      const expectedSec = sa.expectedDuration ?? "";
      const startTime = sa.startedAt
        ? new Date(sa.startedAt).toLocaleTimeString("en-US", { hour12: false })
        : "";
      const endTime = sa.endedAt
        ? new Date(sa.endedAt).toLocaleTimeString("en-US", { hour12: false })
        : "";

      const totalPauseSec = Math.round(
        sa.pauses.reduce((sum, p) => sum + p.durationMs, 0) / 1000
      );
      const pauseReasons = sa.pauses
        .filter((p) => p.reason)
        .map((p) => p.reason)
        .join("; ");

      const row = [
        quote(session.name),
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

  return rows.join("\n");
}

function quote(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
