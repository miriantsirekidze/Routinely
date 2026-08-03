import { db } from "./client";
import { calendarEvents, eventDayNotes, eventAttachments } from "./schema";
import { eq, and, lte, gte } from "drizzle-orm";
import { localDateStr, addDays } from "../utils/date";
import { invalidate } from "./queryCache";
import { removeEventReminders } from "../utils/reminders";

export type CalendarEvent = {
  id: number;
  title: string;
  description: string | null;
  llmNote: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  completed: boolean;
  // Location (destination)
  locLat: number | null;
  locLng: number | null;
  locName: string | null;
  osmUrl: string | null;
  // Route origin + cached route
  originLat: number | null;
  originLng: number | null;
  originName: string | null;
  travelMode: string | null;
  routeDistM: number | null;
  routeDurS: number | null;
  routeGeo: string | null;
  // Cached forecast JSON
  weatherCache: string | null;
  createdAt: Date;
};

export type EventDayNote = {
  id: number;
  eventId: number;
  date: string;
  note: string;
  completed: boolean;
};

export type EventAttachment = {
  id: number;
  eventId: number;
  kind: "photo" | "link";
  uri: string;
  title: string | null;
  sortOrder: number;
};

export type CalendarEventWithNotes = CalendarEvent & {
  dayNotes: EventDayNote[];
  attachments: EventAttachment[];
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
  startTime?: string | null;
  locLat?: number | null;
  locLng?: number | null;
  locName?: string | null;
  osmUrl?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  originName?: string | null;
  travelMode?: string | null;
  routeDistM?: number | null;
  routeDurS?: number | null;
  routeGeo?: string | null;
}): Promise<CalendarEvent> {
  invalidate("events");
  const result = await db.insert(calendarEvents).values(data).returning();
  return result[0] as CalendarEvent;
}

export async function updateEvent(
  id: number,
  patch: Partial<Omit<CalendarEvent, "id" | "createdAt">>
): Promise<void> {
  invalidate("events");
  await db.update(calendarEvents).set(patch).where(eq(calendarEvents.id, id));
}

export type PickedLocation = { lat: number; lng: number; name: string | null; osmUrl?: string | null };

/** Set (or clear, with null) an event's destination location. */
export async function setEventLocation(id: number, loc: PickedLocation | null): Promise<void> {
  invalidate("events");
  await db
    .update(calendarEvents)
    .set(
      loc
        ? { locLat: loc.lat, locLng: loc.lng, locName: loc.name, osmUrl: loc.osmUrl ?? null }
        : { locLat: null, locLng: null, locName: null, osmUrl: null }
    )
    .where(eq(calendarEvents.id, id));
}

export async function deleteEvent(id: number): Promise<void> {
  invalidate("events");
  await removeEventReminders(id);
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

  const attachments = await getEventAttachments(id);

  return {
    ...(rows[0] as CalendarEvent),
    dayNotes: notes as EventDayNote[],
    attachments,
  };
}

export async function getEventAttachments(eventId: number): Promise<EventAttachment[]> {
  return db
    .select()
    .from(eventAttachments)
    .where(eq(eventAttachments.eventId, eventId))
    .orderBy(eventAttachments.sortOrder) as Promise<EventAttachment[]>;
}

export async function addEventAttachment(
  eventId: number,
  data: { kind: "photo" | "link"; uri: string; title?: string | null }
): Promise<void> {
  invalidate("events");
  const existing = await getEventAttachments(eventId);
  const nextOrder = existing.length ? existing[existing.length - 1].sortOrder + 1 : 0;
  await db.insert(eventAttachments).values({
    eventId,
    kind: data.kind,
    uri: data.uri,
    title: data.title ?? null,
    sortOrder: nextOrder,
  });
}

export async function deleteEventAttachment(id: number): Promise<void> {
  invalidate("events");
  await db.delete(eventAttachments).where(eq(eventAttachments.id, id));
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
