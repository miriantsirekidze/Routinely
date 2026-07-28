import { db } from "./client";
import { streaks, days } from "./schema";
import { eq, desc } from "drizzle-orm";
import { getTodayDate } from "../utils/time";

export type StreakData = {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
};

async function getOrCreateStreak(): Promise<{
  id: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}> {
  const existing = await db.select().from(streaks).limit(1);

  if (existing.length > 0) {
    return {
      id: existing[0].id,
      currentStreak: existing[0].currentStreak ?? 0,
      longestStreak: existing[0].longestStreak ?? 0,
      lastActiveDate: existing[0].lastActiveDate,
    };
  }

  const result = await db
    .insert(streaks)
    .values({
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
    })
    .returning();

  return {
    id: result[0].id,
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
  };
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export async function getStreakData(): Promise<StreakData> {
  const streak = await getOrCreateStreak();
  const today = getTodayDate();
  const yesterday = getYesterday();

  if (
    streak.lastActiveDate !== today &&
    streak.lastActiveDate !== yesterday
  ) {
    if (streak.lastActiveDate !== null) {
      await db
        .update(streaks)
        .set({ currentStreak: 0 })
        .where(eq(streaks.id, streak.id));
      streak.currentStreak = 0;
    }
  }

  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    lastActiveDate: streak.lastActiveDate,
  };
}

export async function recordDayCompleted(): Promise<StreakData> {
  const streak = await getOrCreateStreak();
  const today = getTodayDate();
  const yesterday = getYesterday();

  if (streak.lastActiveDate === today) {
    return {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastActiveDate: streak.lastActiveDate,
    };
  }

  let newCurrent: number;

  if (streak.lastActiveDate === yesterday) {
    newCurrent = streak.currentStreak + 1;
  } else {
    newCurrent = 1;
  }

  const newLongest = Math.max(streak.longestStreak, newCurrent);

  await db
    .update(streaks)
    .set({
      currentStreak: newCurrent,
      longestStreak: newLongest,
      lastActiveDate: today,
    })
    .where(eq(streaks.id, streak.id));

  return {
    currentStreak: newCurrent,
    longestStreak: newLongest,
    lastActiveDate: today,
  };
}
