import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface SettingsState {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  defaultRestSeconds: number;

  notifyTimerRunning: boolean;
  notifyTargetExceeded: boolean;
  notifyDayReminder: boolean;
  dayReminderHour: number;
  dayReminderMinute: number;

  dailyCsvFolderUri: string | null;
  dailyCsvFolderName: string | null;
  scheduleFolderUri: string | null;
  scheduleFolderName: string | null;

  setSoundEnabled: (v: boolean) => void;
  setHapticsEnabled: (v: boolean) => void;
  setDefaultRestSeconds: (v: number) => void;
  setNotifyTimerRunning: (v: boolean) => void;
  setNotifyTargetExceeded: (v: boolean) => void;
  setNotifyDayReminder: (v: boolean) => void;
  setDayReminderTime: (hour: number, minute: number) => void;
  setDailyCsvFolder: (uri: string | null, name: string | null) => void;
  setScheduleFolder: (uri: string | null, name: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      hapticsEnabled: true,
      defaultRestSeconds: 30,

      notifyTimerRunning: true,
      notifyTargetExceeded: true,
      notifyDayReminder: false,
      dayReminderHour: 21,
      dayReminderMinute: 0,

      dailyCsvFolderUri: null,
      dailyCsvFolderName: null,
      scheduleFolderUri: null,
      scheduleFolderName: null,

      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
      setDefaultRestSeconds: (v) => set({ defaultRestSeconds: v }),
      setNotifyTimerRunning: (v) => set({ notifyTimerRunning: v }),
      setNotifyTargetExceeded: (v) => set({ notifyTargetExceeded: v }),
      setNotifyDayReminder: (v) => set({ notifyDayReminder: v }),
      setDayReminderTime: (hour, minute) =>
        set({ dayReminderHour: hour, dayReminderMinute: minute }),
      setDailyCsvFolder: (uri, name) =>
        set({ dailyCsvFolderUri: uri, dailyCsvFolderName: name }),
      setScheduleFolder: (uri, name) =>
        set({ scheduleFolderUri: uri, scheduleFolderName: name }),
    }),
    {
      name: "routinely-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
