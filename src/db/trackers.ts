import { db } from "./client";
import { trackers, trackerResets } from "./schema";
import { eq, desc } from "drizzle-orm";
import { invalidate } from "./queryCache";

export type Tracker = {
  id: number;
  name: string;
  emoji: string | null;
  description: string | null;
  milestoneDay: number | null;
  milestoneText: string | null;
  startedAt: Date;
  targetDays: number | null;
  pausedAt: Date | null;
  pausedMs: number;
  createdAt: Date;
  elapsedMs: number;
};

export type TrackerReset = {
  id: number;
  trackerId: number;
  resetAt: Date;
  durationMs: number;
  note: string | null;
};

function computeElapsedMs(row: {
  startedAt: Date;
  pausedAt: Date | null;
  pausedMs: number;
}): number {
  const base = (row.pausedAt ?? new Date()).getTime() - row.startedAt.getTime() - row.pausedMs;
  return Math.max(0, base);
}

export async function getTrackers(): Promise<Tracker[]> {
  const rows = await db.select().from(trackers).orderBy(desc(trackers.createdAt));
  return rows.map((row) => ({ ...row, elapsedMs: computeElapsedMs(row as any) }));
}

export async function createTracker(data: {
  name: string;
  emoji?: string | null;
  description?: string | null;
  startedAt: Date;
  targetDays?: number | null;
}): Promise<Tracker> {
  invalidate("trackers");
  const result = await db
    .insert(trackers)
    .values({
      name: data.name,
      emoji: data.emoji ?? null,
      description: data.description ?? null,
      startedAt: data.startedAt,
      targetDays: data.targetDays ?? null,
    })
    .returning();
  const row = result[0];
  return { ...row, elapsedMs: computeElapsedMs(row as any) };
}

export async function deleteTracker(id: number): Promise<void> {
  invalidate("trackers");
  await db.delete(trackers).where(eq(trackers.id, id));
}

export async function resetTracker(id: number, note?: string): Promise<void> {
  invalidate("trackers");
  const rows = await db.select().from(trackers).where(eq(trackers.id, id)).limit(1);
  if (!rows[0]) return;

  const now = new Date();
  const elapsed = computeElapsedMs(rows[0] as any);

  await db.insert(trackerResets).values({
    trackerId: id,
    resetAt: now,
    durationMs: elapsed,
    note: note?.trim() || null,
  });

  // Clear cached milestone so it regenerates after fresh start
  await db
    .update(trackers)
    .set({ startedAt: now, pausedMs: 0, pausedAt: null, milestoneDay: null, milestoneText: null })
    .where(eq(trackers.id, id));
}

export async function saveMilestone(
  id: number,
  day: number,
  text: string
): Promise<void> {
  invalidate("trackers");
  await db
    .update(trackers)
    .set({ milestoneDay: day, milestoneText: text })
    .where(eq(trackers.id, id));
}

export async function getTrackerResets(trackerId: number): Promise<TrackerReset[]> {
  return db
    .select()
    .from(trackerResets)
    .where(eq(trackerResets.trackerId, trackerId))
    .orderBy(desc(trackerResets.resetAt));
}

export function formatElapsedDays(ms: number): number {
  return Math.floor(ms / 86400000);
}

// For the large hero/card display — shows the most meaningful unit
export function formatCardElapsed(ms: number): { value: string; unit: string } {
  if (ms < 3600000) {
    const mins = Math.max(1, Math.floor(ms / 60000));
    return { value: String(mins), unit: "min" };
  }
  if (ms < 86400000) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return { value: String(h), unit: `h ${m}m` };
  }
  const days = Math.floor(ms / 86400000);
  return { value: String(days), unit: days === 1 ? "day" : "days" };
}

export function formatVerboseElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "Day" : "Days"}`);
  if (days > 0 || hours > 0) parts.push(`${hours} ${hours === 1 ? "Hour" : "Hours"}`);
  parts.push(`${mins} ${mins === 1 ? "Minute" : "Minutes"}`);

  return parts.join(", ");
}

export function formatElapsedDetail(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
