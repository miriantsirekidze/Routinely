import { db } from "./client";
import { calendarEvents, eventDayNotes } from "./schema";
import { eq, and, lte, gte } from "drizzle-orm";
import { localDateStr, addDays } from "../utils/date";

export type CalendarEvent = {
  id: number;
  title: string;
  description: string | null;
  llmNote: string | null;
  startDate: string;
  endDate: string;
  completed: boolean;
  createdAt: Date;
};

export type EventDayNote = {
  id: number;
  eventId: number;
  date: string;
  note: string;
  completed: boolean;
};

export type CalendarEventWithNotes = CalendarEvent & {
  dayNotes: EventDayNote[];
};

export async function getEventsForMonth(
  year: number,
  month: number
): Promise<CalendarEvent[]> {
  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = localDateStr(new Date(year, month + 1, 0));

  return db
    .select()
    .from(calendarEvents)
    .where(
      and(lte(calendarEvents.startDate, lastDay), gte(calendarEvents.endDate, firstDay))
    )
    .orderBy(calendarEvents.startDate) as Promise<CalendarEvent[]>;
}

export async function getUpcomingEvents(days = 3): Promise<CalendarEvent[]> {
  const today = localDateStr(new Date());
  const future = localDateStr(addDays(new Date(), days));

  return db
    .select()
    .from(calendarEvents)
    .where(
      and(
        gte(calendarEvents.startDate, today),
        lte(calendarEvents.startDate, future),
        eq(calendarEvents.completed, false)
      )
    )
    .orderBy(calendarEvents.startDate) as Promise<CalendarEvent[]>;
}

export async function createEvent(data: {
  title: string;
  description?: string | null;
  startDate: string;
  endDate: string;
}): Promise<CalendarEvent> {
  const result = await db.insert(calendarEvents).values(data).returning();
  return result[0] as CalendarEvent;
}

export async function updateEvent(
  id: number,
  patch: Partial<Pick<CalendarEvent, "title" | "startDate" | "endDate" | "completed">>
): Promise<void> {
  await db.update(calendarEvents).set(patch).where(eq(calendarEvents.id, id));
}

export async function deleteEvent(id: number): Promise<void> {
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
}

export async function getEventWithNotes(
  id: number
): Promise<CalendarEventWithNotes | null> {
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, id))
    .limit(1);
  if (!rows[0]) return null;

  const notes = await db
    .select()
    .from(eventDayNotes)
    .where(eq(eventDayNotes.eventId, id))
    .orderBy(eventDayNotes.date);

  return { ...(rows[0] as CalendarEvent), dayNotes: notes as EventDayNote[] };
}

export async function saveLLMNote(id: number, note: string): Promise<void> {
  await db
    .update(calendarEvents)
    .set({ llmNote: note })
    .where(eq(calendarEvents.id, id));
}

export async function deleteDayNote(eventId: number, date: string): Promise<void> {
  await db
    .delete(eventDayNotes)
    .where(and(eq(eventDayNotes.eventId, eventId), eq(eventDayNotes.date, date)));
}

export async function upsertDayNote(
  eventId: number,
  date: string,
  data: { note?: string; completed?: boolean }
): Promise<void> {
  const existing = await db
    .select()
    .from(eventDayNotes)
    .where(and(eq(eventDayNotes.eventId, eventId), eq(eventDayNotes.date, date)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(eventDayNotes)
      .set(data)
      .where(eq(eventDayNotes.id, existing[0].id));
  } else {
    await db.insert(eventDayNotes).values({
      eventId,
      date,
      note: data.note ?? "",
      completed: data.completed ?? false,
    });
  }
}
