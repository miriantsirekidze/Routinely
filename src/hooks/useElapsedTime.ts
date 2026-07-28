import { useEffect, useState } from "react";
import { useTimerStore } from "../stores/timerStore";

export function useElapsedTime(): number {
  const status = useTimerStore((s) => s.status);
  const subActivityStartedAt = useTimerStore((s) => s.subActivityStartedAt);
  const accumulatedMs = useTimerStore((s) => s.accumulatedMs);

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== "running" || !subActivityStartedAt) {
      setElapsed(accumulatedMs);
      return;
    }

    const tick = () => {
      setElapsed(accumulatedMs + (Date.now() - subActivityStartedAt));
    };

    tick();
    const interval = setInterval(tick, 16);
    return () => clearInterval(interval);
  }, [status, subActivityStartedAt, accumulatedMs]);

  return elapsed;
}

export function useRestCountdown(): number {
  const status = useTimerStore((s) => s.status);
  const restStartedAt = useTimerStore((s) => s.restStartedAt);
  const restDuration = useTimerStore((s) => s.restDuration);

  const [remaining, setRemaining] = useState(() => {
    if (status === "rest" && restStartedAt) {
      return Math.max(0, restDuration * 1000 - (Date.now() - restStartedAt));
    }
    return restDuration * 1000;
  });

  useEffect(() => {
    if (status !== "rest" || !restStartedAt) {
      setRemaining(restDuration * 1000);
      return;
    }

    const tick = () => {
      const elapsed = Date.now() - restStartedAt;
      const rem = Math.max(0, restDuration * 1000 - elapsed);
      setRemaining(rem);
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [status, restStartedAt, restDuration]);

  return remaining;
}

export function useRepRestCountdown(): number {
  const repRestActive = useTimerStore((s) => s.repRestActive);
  const repRestStartedAt = useTimerStore((s) => s.repRestStartedAt);
  const repRestDuration = useTimerStore((s) => s.repRestDuration);

  const [remaining, setRemaining] = useState(() => {
    if (repRestActive && repRestStartedAt) {
      return Math.max(0, repRestDuration * 1000 - (Date.now() - repRestStartedAt));
    }
    return repRestDuration * 1000;
  });

  useEffect(() => {
    if (!repRestActive || !repRestStartedAt) {
      setRemaining(repRestDuration * 1000);
      return;
    }

    const tick = () => {
      const elapsed = Date.now() - repRestStartedAt;
      setRemaining(Math.max(0, repRestDuration * 1000 - elapsed));
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [repRestActive, repRestStartedAt, repRestDuration]);

  return remaining;
}

export function usePauseElapsed(): number {
  const status = useTimerStore((s) => s.status);
  const pauseStartedAt = useTimerStore((s) => s.pauseStartedAt);
  const sessionTotalPauseMs = useTimerStore((s) => s.sessionTotalPauseMs);

  const [pauseElapsed, setPauseElapsed] = useState(sessionTotalPauseMs);

  useEffect(() => {
    if (status !== "paused" || !pauseStartedAt) {
      setPauseElapsed(sessionTotalPauseMs);
      return;
    }

    const tick = () => {
      setPauseElapsed(sessionTotalPauseMs + (Date.now() - pauseStartedAt));
    };

    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [status, pauseStartedAt, sessionTotalPauseMs]);

  return pauseElapsed;
}

export function useSessionElapsed(): number {
  const completedSubActivities = useTimerStore((s) => s.completedSubActivities);
  const currentElapsed = useElapsedTime();
  const status = useTimerStore((s) => s.status);

  const completedTotal = completedSubActivities.reduce(
    (sum, sa) => sum + sa.elapsedMs,
    0
  );

  if (status === "finished" || status === "idle") {
    return completedTotal;
  }

  return completedTotal + currentElapsed;
}
