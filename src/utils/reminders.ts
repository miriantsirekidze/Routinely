import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

// We persist a small record per scheduled reminder (id + message + fire time) rather than
// parse expo-notifications' platform-specific trigger shapes back out. This gives a reliable
// list to display, edit, and cancel.
const KEY = "routinely-reminders";

export type Reminder = { id: string; body: string; fireAt: number; eventId?: number };

async function readAll(): Promise<Reminder[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Reminder[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: Reminder[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export async function addReminder(r: Reminder): Promise<void> {
  const list = await readAll();
  list.push(r);
  await writeAll(list);
}

/** Upcoming ad-hoc reminders (no event), soonest first. Prunes any that have fired. */
export async function listReminders(): Promise<Reminder[]> {
  return (await listUpcoming()).filter((r) => r.eventId == null);
}

/** Upcoming reminders attached to a specific event, soonest first. */
export async function listEventReminders(eventId: number): Promise<Reminder[]> {
  return (await listUpcoming()).filter((r) => r.eventId === eventId);
}

async function listUpcoming(): Promise<Reminder[]> {
  const now = Date.now();
  const list = await readAll();
  const upcoming = list.filter((r) => r.fireAt > now);
  if (upcoming.length !== list.length) await writeAll(upcoming);
  return upcoming.sort((a, b) => a.fireAt - b.fireAt);
}

/** Cancel and forget all reminders attached to an event (used when the event is deleted). */
export async function removeEventReminders(eventId: number): Promise<void> {
  const list = await readAll();
  const mine = list.filter((r) => r.eventId === eventId);
  for (const r of mine) {
    try { await Notifications.cancelScheduledNotificationAsync(r.id); } catch {}
  }
  await writeAll(list.filter((r) => r.eventId !== eventId));
}

/** Cancel a scheduled reminder and forget it. */
export async function removeReminder(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
  const list = await readAll();
  await writeAll(list.filter((r) => r.id !== id));
}
