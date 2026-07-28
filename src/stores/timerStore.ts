import { create } from "zustand";
import { db } from "../db/client";
import { days, sessions, subActivities, pauses } from "../db/schema";
import { eq } from "drizzle-orm";
import { getTodayDate } from "../utils/time";
import {
  showTimerNotification,
  updateTimerNotification,
  dismissTimerNotification,
} from "../utils/notifications";

export type SubActivityDef = {
  name: string;
  expectedDuration?: number;
  restDuration: number;
};

export type TimerStatus =
  | "idle"
  | "running"
  | "paused"
  | "rest"
  | "finished";

export type CompletedSubActivity = {
  dbId: number;
  name: string;
  elapsedMs: number;
  expectedDuration?: number;
  startedAt?: number;
  endedAt?: number;
};

interface TimerState {
  status: TimerStatus;
  sessionDbId: number | null;
  dayDbId: number | null;
  sessionName: string;

  subActivityDefs: SubActivityDef[];
  currentSubActivityIndex: number;
  currentSubActivityDbId: number | null;
  completedSubActivities: CompletedSubActivity[];

  subActivityStartedAt: number | null;
  subActivityRealStartedAt: number | null;
  accumulatedMs: number;

  pauseStartedAt: number | null;
  totalPauseMs: number;
  sessionTotalPauseMs: number;
  sessionTotalRestMs: number;

  restStartedAt: number | null;
  restDuration: number;

  repRestActive: boolean;
  repRestStartedAt: number | null;
  repRestDuration: number;
  repRestCount: number;
  repRestTotalMs: number;

  startSession: (
    name: string,
    subActivityDefs: SubActivityDef[],
    expectedDuration?: number,
    templateId?: number
  ) => Promise<void>;
  startNextSubActivity: () => Promise<void>;
  pauseTimer: (reason?: string) => Promise<void>;
  resumeTimer: () => Promise<void>;
  finishSubActivity: () => Promise<void>;
  startRepRest: (durationSeconds: number) => void;
  finishSession: () => Promise<void>;
  discardSession: () => Promise<void>;
  reset: () => void;
}

const initialState = {
  status: "idle" as TimerStatus,
  sessionDbId: null,
  dayDbId: null,
  sessionName: "",
  subActivityDefs: [],
  currentSubActivityIndex: -1,
  currentSubActivityDbId: null,
  completedSubActivities: [],
  subActivityStartedAt: null,
  subActivityRealStartedAt: null,
  accumulatedMs: 0,
  pauseStartedAt: null,
  totalPauseMs: 0,
  sessionTotalPauseMs: 0,
  sessionTotalRestMs: 0,
  restStartedAt: null,
  restDuration: 30,
  repRestActive: false,
  repRestStartedAt: null,
  repRestDuration: 30,
  repRestCount: 0,
  repRestTotalMs: 0,
};

export const useTimerStore = create<TimerState>((set, get) => ({
  ...initialState,

  startSession: async (name, subActivityDefs, expectedDuration, templateId) => {
    const todayStr = getTodayDate();

    let dayRow = await db.query.days.findFirst({
      where: eq(days.date, todayStr),
    });

    if (!dayRow) {
      const result = await db.insert(days).values({ date: todayStr }).returning();
      dayRow = result[0];
    }

    const sessionResult = await db
      .insert(sessions)
      .values({
        dayId: dayRow.id,
        name,
        startedAt: new Date(),
        expectedDuration: expectedDuration ?? null,
        templateId: templateId ?? null,
      })
      .returning();

    set({
      status: "idle",
      sessionDbId: sessionResult[0].id,
      dayDbId: dayRow.id,
      sessionName: name,
      subActivityDefs,
      currentSubActivityIndex: -1,
      currentSubActivityDbId: null,
      completedSubActivities: [],
      accumulatedMs: 0,
      pauseStartedAt: null,
      totalPauseMs: 0,
      restStartedAt: null,
    });

    await get().startNextSubActivity();
  },

  startNextSubActivity: async () => {
    const state = get();
    const nextIndex = state.currentSubActivityIndex + 1;

    if (nextIndex >= state.subActivityDefs.length) {
      await get().finishSession();
      return;
    }

    let restElapsed = 0;
    if (state.status === "rest" && state.restStartedAt) {
      restElapsed = Date.now() - state.restStartedAt;
    }

    const def = state.subActivityDefs[nextIndex];
    const now = new Date();

    const result = await db
      .insert(subActivities)
      .values({
        sessionId: state.sessionDbId!,
        name: def.name,
        sortOrder: nextIndex,
        startedAt: now,
        expectedDuration: def.expectedDuration ?? null,
      })
      .returning();

    set({
      status: "running",
      currentSubActivityIndex: nextIndex,
      currentSubActivityDbId: result[0].id,
      subActivityStartedAt: Date.now(),
      subActivityRealStartedAt: Date.now(),
      accumulatedMs: 0,
      pauseStartedAt: null,
      totalPauseMs: 0,
      restStartedAt: null,
      restDuration: def.restDuration,
      sessionTotalRestMs: state.sessionTotalRestMs + restElapsed,
    });

    showTimerNotification(state.sessionName, def.name);
  },

  pauseTimer: async (_reason?: string) => {
    const state = get();
    if (state.status !== "running") return;

    const now = Date.now();
    const elapsed = state.accumulatedMs + (now - (state.subActivityStartedAt ?? now));

    set({
      status: "paused",
      pauseStartedAt: now,
      accumulatedMs: elapsed,
      subActivityStartedAt: null,
    });

    const def = state.subActivityDefs[state.currentSubActivityIndex];
    updateTimerNotification(state.sessionName, def.name, true);
  },

  resumeTimer: async () => {
    const state = get();
    if (state.status !== "paused") return;

    const now = Date.now();
    const pauseDuration = now - (state.pauseStartedAt ?? now);

    set({
      status: "running",
      subActivityStartedAt: now,
      pauseStartedAt: null,
      totalPauseMs: state.totalPauseMs + pauseDuration,
      sessionTotalPauseMs: state.sessionTotalPauseMs + pauseDuration,
    });

    const def = state.subActivityDefs[state.currentSubActivityIndex];
    updateTimerNotification(state.sessionName, def.name, false);
  },

  finishSubActivity: async () => {
    const state = get();
    if (state.status !== "running" && state.status !== "paused") return;

    const now = Date.now();
    let elapsed = state.accumulatedMs;
    if (state.status === "running" && state.subActivityStartedAt) {
      elapsed += now - state.subActivityStartedAt;
    }

    const def = state.subActivityDefs[state.currentSubActivityIndex];

    await db
      .update(subActivities)
      .set({
        endedAt: new Date(),
        elapsedMs: Math.round(elapsed),
      })
      .where(eq(subActivities.id, state.currentSubActivityDbId!));

    const completed: CompletedSubActivity = {
      dbId: state.currentSubActivityDbId!,
      name: def.name,
      elapsedMs: Math.round(elapsed),
      expectedDuration: def.expectedDuration,
      startedAt: state.subActivityRealStartedAt ?? undefined,
      endedAt: now,
    };

    const hasNext =
      state.currentSubActivityIndex + 1 < state.subActivityDefs.length;

    set({
      completedSubActivities: [...state.completedSubActivities, completed],
      accumulatedMs: 0,
      subActivityStartedAt: null,
      pauseStartedAt: null,
      totalPauseMs: 0,
      status: hasNext ? "rest" : "idle",
      restStartedAt: hasNext ? Date.now() : null,
    });

    if (!hasNext) {
      await get().finishSession();
    }
  },

  startRepRest: (durationSeconds: number) => {
    const state = get();
    if (state.status !== "running") return;

    const now = Date.now();
    const elapsed = state.accumulatedMs + (now - (state.subActivityStartedAt ?? now));

    set({
      repRestActive: true,
      repRestStartedAt: now,
      repRestDuration: durationSeconds,
      accumulatedMs: elapsed,
      subActivityStartedAt: null,
    });
  },

  finishSession: async () => {
    const state = get();
    if (!state.sessionDbId) return;

    await db
      .update(sessions)
      .set({ endedAt: new Date() })
      .where(eq(sessions.id, state.sessionDbId));

    set({ status: "finished" });
    dismissTimerNotification();
  },

  discardSession: async () => {
    const state = get();
    if (!state.sessionDbId) return;

    const subs = await db
      .select({ id: subActivities.id })
      .from(subActivities)
      .where(eq(subActivities.sessionId, state.sessionDbId));

    if (subs.length > 0) {
      for (const sub of subs) {
        await db.delete(pauses).where(eq(pauses.subActivityId, sub.id));
      }
      await db
        .delete(subActivities)
        .where(eq(subActivities.sessionId, state.sessionDbId));
    }

    await db.delete(sessions).where(eq(sessions.id, state.sessionDbId));

    set(initialState);
    dismissTimerNotification();
  },

  reset: () => set(initialState),
}));
