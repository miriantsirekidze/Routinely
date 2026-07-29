import { db } from "./client";
import { days, sessions, subActivities, pauses } from "./schema";
import { eq, desc, asc, and, lt, inArray } from "drizzle-orm";
import { invalidateSessionData } from "./queryCache";

export async function deleteSession(sessionId: number): Promise<void> {
  invalidateSessionData();
  const subs = await db
    .select({ id: subActivities.id })
    .from(subActivities)
    .where(eq(subActivities.sessionId, sessionId));

  if (subs.length > 0) {
    const subIds = subs.map((s) => s.id);
    await db.delete(pauses).where(inArray(pauses.subActivityId, subIds));
    await db.delete(subActivities).where(eq(subActivities.sessionId, sessionId));
  }

  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export type HistorySession = {
  id: number;
  name: string;
  startedAt: Date | null;
  endedAt: Date | null;
  expectedDuration: number | null;
  totalElapsedMs: number;
  subActivities: {
    id: number;
    name: string;
    elapsedMs: number | null;
    expectedDuration: number | null;
    startedAt: Date | null;
    endedAt: Date | null;
  }[];
};

export type HistoryDay = {
  id: number;
  date: string;
  finishedAt: Date | null;
  sessions: HistorySession[];
};

export async function getHistoryDays(): Promise<HistoryDay[]> {
  const allDays = await db
    .select()
    .from(days)
    .orderBy(desc(days.date));

  const result: HistoryDay[] = [];

  for (const day of allDays) {
    const daySessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.dayId, day.id))
      .orderBy(asc(sessions.sortOrder));

    const sessionResults: HistorySession[] = [];

    for (const s of daySessions) {
      if (!s.endedAt) continue;

      const subs = await db
        .select()
        .from(subActivities)
        .where(eq(subActivities.sessionId, s.id))
        .orderBy(asc(subActivities.sortOrder));

      const totalMs = subs.reduce(
        (sum, sa) => sum + (sa.elapsedMs ?? 0),
        0
      );

      sessionResults.push({
        id: s.id,
        name: s.name,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        expectedDuration: s.expectedDuration,
        totalElapsedMs: totalMs,
        subActivities: subs.map((sa) => ({
          id: sa.id,
          name: sa.name,
          elapsedMs: sa.elapsedMs,
          expectedDuration: sa.expectedDuration,
          startedAt: sa.startedAt,
          endedAt: sa.endedAt,
        })),
      });
    }

    if (sessionResults.length > 0) {
      result.push({
        id: day.id,
        date: day.date,
        finishedAt: day.finishedAt,
        sessions: sessionResults,
      });
    }
  }

  return result;
}

export async function getPreviousSessionTime(
  sessionName: string,
  beforeSessionId: number
): Promise<number | null> {
  const prev = await db
    .select({
      id: sessions.id,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.name, sessionName),
        lt(sessions.id, beforeSessionId)
      )
    )
    .orderBy(desc(sessions.id))
    .limit(1);

  if (prev.length === 0) return null;

  const subs = await db
    .select()
    .from(subActivities)
    .where(eq(subActivities.sessionId, prev[0].id));

  return subs.reduce((sum, sa) => sum + (sa.elapsedMs ?? 0), 0);
}

export async function getSessionsByName(
  name: string
): Promise<HistorySession[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.name, name))
    .orderBy(desc(sessions.id));

  const result: HistorySession[] = [];

  for (const s of rows) {
    if (!s.endedAt) continue;

    const subs = await db
      .select()
      .from(subActivities)
      .where(eq(subActivities.sessionId, s.id))
      .orderBy(asc(subActivities.sortOrder));

    const totalMs = subs.reduce(
      (sum, sa) => sum + (sa.elapsedMs ?? 0),
      0
    );

    result.push({
      id: s.id,
      name: s.name,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      expectedDuration: s.expectedDuration,
      totalElapsedMs: totalMs,
      subActivities: subs.map((sa) => ({
        id: sa.id,
        name: sa.name,
        elapsedMs: sa.elapsedMs,
        expectedDuration: sa.expectedDuration,
        startedAt: sa.startedAt,
        endedAt: sa.endedAt,
      })),
    });
  }

  return result;
}
