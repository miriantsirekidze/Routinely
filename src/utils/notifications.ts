import * as Notifications from "expo-notifications";
import { useSettingsStore } from "../stores/settingsStore";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const TIMER_NOTIFICATION_ID = "timer-running";
const TARGET_NOTIFICATION_ID = "target-exceeded";

export async function requestPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function showTimerNotification(
  sessionName: string,
  activityName: string
) {
  if (!useSettingsStore.getState().notifyTimerRunning) return;

  await Notifications.scheduleNotificationAsync({
    identifier: TIMER_NOTIFICATION_ID,
    content: {
      title: sessionName,
      body: activityName,
      sticky: true,
    },
    trigger: null,
  });
}

export async function updateTimerNotification(
  sessionName: string,
  activityName: string,
  paused = false
) {
  if (!useSettingsStore.getState().notifyTimerRunning) return;

  await Notifications.scheduleNotificationAsync({
    identifier: TIMER_NOTIFICATION_ID,
    content: {
      title: sessionName,
      body: paused ? `${activityName} (paused)` : activityName,
      sticky: true,
    },
    trigger: null,
  });
}

export async function dismissTimerNotification() {
  await Notifications.dismissNotificationAsync(TIMER_NOTIFICATION_ID);
}

export async function showTargetExceededNotification(
  sessionName: string,
  activityName: string
) {
  if (!useSettingsStore.getState().notifyTargetExceeded) return;

  await Notifications.scheduleNotificationAsync({
    identifier: TARGET_NOTIFICATION_ID,
    content: {
      title: "Target Exceeded",
      body: `${activityName} in ${sessionName} has passed its expected time`,
      sound: true,
    },
    trigger: null,
  });
}

/**
 * Schedule a one-off reminder notification that fires at `date` with the given message.
 * Requests notification permission first. Returns the scheduled id, or "" if not permitted.
 */
export async function scheduleReminder(body: string, date: Date): Promise<string> {
  const granted = await requestPermissions();
  if (!granted) return "";

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Reminder",
      body,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
    },
  });
}

export async function scheduleDayReminder() {
  const settings = useSettingsStore.getState();
  if (!settings.notifyDayReminder) return;

  await cancelDayReminder();

  await Notifications.scheduleNotificationAsync({
    identifier: "day-reminder",
    content: {
      title: "Finish Your Day",
      body: "You have sessions recorded but haven't finished the day yet",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: settings.dayReminderHour,
      minute: settings.dayReminderMinute,
    },
  });
}

export async function cancelDayReminder() {
  await Notifications.cancelScheduledNotificationAsync("day-reminder");
}
