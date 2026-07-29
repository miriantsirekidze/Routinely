import { db } from "./client";
import { weeklySchedule, sessionTemplates, subActivityTemplates } from "./schema";
import { eq, and, asc } from "drizzle-orm";
import { TemplateWithSubs } from "./templates";
import { invalidate } from "./queryCache";

export type ScheduleEntry = {
  id: number;
  dayOfWeek: number;
  templateId: number;
  sortOrder: number;
  templateName: string;
  expectedDuration: number | null;
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function getDayName(day: number): string {
  return DAY_NAMES[day] ?? "";
}

export function getDayShort(day: number): string {
  return DAY_SHORT[day] ?? "";
}

export async function getScheduleForDay(
  dayOfWeek: number
): Promise<ScheduleEntry[]> {
  const rows = await db
    .select({
      id: weeklySchedule.id,
      dayOfWeek: weeklySchedule.dayOfWeek,
      templateId: weeklySchedule.templateId,
      sortOrder: weeklySchedule.sortOrder,
      templateName: sessionTemplates.name,
      expectedDuration: sessionTemplates.expectedDuration,
    })
    .from(weeklySchedule)
    .innerJoin(
      sessionTemplates,
      eq(weeklySchedule.templateId, sessionTemplates.id)
    )
    .where(eq(weeklySchedule.dayOfWeek, dayOfWeek))
    .orderBy(asc(weeklySchedule.sortOrder));

  return rows;
}

export async function getFullSchedule(): Promise<
  Record<number, ScheduleEntry[]>
> {
  const rows = await db
    .select({
      id: weeklySchedule.id,
      dayOfWeek: weeklySchedule.dayOfWeek,
      templateId: weeklySchedule.templateId,
      sortOrder: weeklySchedule.sortOrder,
      templateName: sessionTemplates.name,
      expectedDuration: sessionTemplates.expectedDuration,
    })
    .from(weeklySchedule)
    .innerJoin(
      sessionTemplates,
      eq(weeklySchedule.templateId, sessionTemplates.id)
    )
    .orderBy(asc(weeklySchedule.dayOfWeek), asc(weeklySchedule.sortOrder));

  const schedule: Record<number, ScheduleEntry[]> = {};
  for (let i = 0; i < 7; i++) schedule[i] = [];
  for (const row of rows) {
    schedule[row.dayOfWeek].push(row);
  }
  return schedule;
}

export async function addToSchedule(
  dayOfWeek: number,
  templateId: number
): Promise<void> {
  invalidate("schedule");
  const existing = await db
    .select()
    .from(weeklySchedule)
    .where(eq(weeklySchedule.dayOfWeek, dayOfWeek))
    .orderBy(asc(weeklySchedule.sortOrder));

  const nextOrder = existing.length > 0
    ? existing[existing.length - 1].sortOrder + 1
    : 0;

  await db.insert(weeklySchedule).values({
    dayOfWeek,
    templateId,
    sortOrder: nextOrder,
  });
}

export async function removeFromSchedule(id: number): Promise<void> {
  invalidate("schedule");
  await db.delete(weeklySchedule).where(eq(weeklySchedule.id, id));
}

export async function reorderScheduleEntries(
  dayOfWeek: number,
  orderedIds: number[]
): Promise<void> {
  invalidate("schedule");
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(weeklySchedule)
      .set({ sortOrder: i })
      .where(eq(weeklySchedule.id, orderedIds[i]));
  }
}
