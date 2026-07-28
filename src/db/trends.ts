import { db } from "./client";
import { sessions, subActivities, days } from "./schema";
import { eq, desc, asc, and, isNotNull } from "drizzle-orm";

export type TrendPoint = {
  date: string;
  totalMs: number;
  label: string;
};

export type SessionTrend = {
  name: string;
  points: TrendPoint[];
  averageMs: number;
  lastMs: number;
  bestMs: number;
  worstMs: number;
  runCount: number;
};

export async function getSessionTrend(
  sessionName: string,
  limit = 10
): Promise<SessionTrend | null> {
  const rows = await db
    .select({
      sessionId: sessions.id,
      dayId: sessions.dayId,
      startedAt: sessions.startedAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.name, sessionName),
        isNotNull(sessions.endedAt)
      )
    )
    .orderBy(desc(sessions.id))
    .limit(limit);

  if (rows.length === 0) return null;

  const points: TrendPoint[] = [];

  for (const row of rows) {
    const subs = await db
      .select()
      .from(subActivities)
      .where(eq(subActivities.sessionId, row.sessionId));

    const totalMs = subs.reduce((sum, s) => sum + (s.elapsedMs ?? 0), 0);
    if (totalMs === 0) continue;

    const dayRow = await db
      .select()
      .from(days)
      .where(eq(days.id, row.dayId))
      .limit(1);

    const date = dayRow[0]?.date ?? "";
    const d = new Date(date + "T12:00:00");
    const label = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    points.push({ date, totalMs, label });
  }

  points.reverse();

  const times = points.map((p) => p.totalMs);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;

  return {
    name: sessionName,
    points,
    averageMs: Math.round(avg),
    lastMs: times[times.length - 1],
    bestMs: Math.min(...times),
    worstMs: Math.max(...times),
    runCount: points.length,
  };
}

export async function getUniqueSessionNames(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: sessions.name })
    .from(sessions)
    .orderBy(asc(sessions.name));

  return rows.map((r) => r.name).filter((n) => n.trim() !== "");
}
