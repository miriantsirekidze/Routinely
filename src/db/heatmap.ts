import { db } from "./client";
import { days, sessions, subActivities } from "./schema";
import { eq, asc, gte } from "drizzle-orm";

export type HeatmapDay = {
  date: string;
  count: number;
  totalMs: number;
};

export type HeatmapData = {
  days: Record<string, HeatmapDay>;
  totalMs: number;
  totalSessions: number;
  activeDays: number;
};

export async function getHeatmapData(): Promise<HeatmapData> {
  const allDays = await db
    .select()
    .from(days)
    .orderBy(asc(days.date));

  const result: Record<string, HeatmapDay> = {};
  let totalMs = 0;
  let totalSessions = 0;
  let activeDays = 0;

  for (const day of allDays) {
    const daySessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.dayId, day.id));

    let dayTotalMs = 0;
    let dayCount = 0;

    for (const s of daySessions) {
      if (!s.endedAt) continue;

      const subs = await db
        .select()
        .from(subActivities)
        .where(eq(subActivities.sessionId, s.id));

      const sessionMs = subs.reduce(
        (sum, sa) => sum + (sa.elapsedMs ?? 0),
        0
      );
      dayTotalMs += sessionMs;
      dayCount++;
    }

    if (dayCount > 0) {
      result[day.date] = {
        date: day.date,
        count: dayCount,
        totalMs: dayTotalMs,
      };
      totalMs += dayTotalMs;
      totalSessions += dayCount;
      activeDays++;
    }
  }

  return {
    days: result,
    totalMs,
    totalSessions,
    activeDays,
  };
}
