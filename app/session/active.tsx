import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, ToastAndroid } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useTimerStore } from "../../src/stores/timerStore";
import {
  useElapsedTime,
  useRestCountdown,
  useSessionElapsed,
  usePauseElapsed,
  useRepRestCountdown,
} from "../../src/hooks/useElapsedTime";
import { TimerDisplay } from "../../src/components/TimerDisplay";
import { ActionButton } from "../../src/components/ActionButton";
import { CompletedList } from "../../src/components/CompletedList";
import { UpcomingList } from "../../src/components/UpcomingList";
import { RestCountdown } from "../../src/components/RestCountdown";
import { formatElapsedShort } from "../../src/utils/time";
import { successHaptic, mediumHaptic, warningHaptic, lightHaptic } from "../../src/utils/feedback";
import { useSound } from "../../src/hooks/useSound";
import { showTargetExceededNotification } from "../../src/utils/notifications";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function ActiveSessionScreen() {
  useKeepAwake();

  const router = useRouter();
  const store = useTimerStore();
  const elapsed = useElapsedTime();
  const restRemaining = useRestCountdown();
  const sessionElapsed = useSessionElapsed();
  const pauseElapsed = usePauseElapsed();
  const repRestRemaining = useRepRestCountdown();
  const targetExceededFired = useRef(false);
  const repRestHasStarted = useRef(false);

  const sessionEndSound = useSound("sessionEnd");
  const warningSound = useSound("warning");
  const halfwaySound = useSound("halfway");
  const tickSound = useSound("tick");

  const currentDef = store.subActivityDefs[store.currentSubActivityIndex];

  useEffect(() => {
    targetExceededFired.current = false;
    halfwayFired.current = false;
    lastCountdownSecond.current = 0;
  }, [store.currentSubActivityIndex]);

  const halfwayFired = useRef(false);
  const lastCountdownSecond = useRef(0);

  useEffect(() => {
    if (!currentDef?.expectedDuration) return;
    const expectedMs = currentDef.expectedDuration * 1000;

    if (elapsed >= expectedMs / 2 && !halfwayFired.current) {
      halfwayFired.current = true;
      halfwaySound.play();
      mediumHaptic();
    }

    const remaining = expectedMs - elapsed;
    if (remaining > 0 && remaining <= 3000) {
      const sec = Math.ceil(remaining / 1000);
      if (sec !== lastCountdownSecond.current && sec <= 3) {
        lastCountdownSecond.current = sec;
        tickSound.play();
        lightHaptic();
      }
    }

    if (elapsed > expectedMs && !targetExceededFired.current) {
      targetExceededFired.current = true;
      warningHaptic();
      warningSound.play();
      showTargetExceededNotification(store.sessionName, currentDef.name);
    }
  }, [elapsed]);
  const totalSubs = store.subActivityDefs.length;
  const currentIndex = store.currentSubActivityIndex + 1;

  useEffect(() => {
    if (store.repRestActive) {
      repRestHasStarted.current = true;
    }
    if (
      repRestHasStarted.current &&
      repRestRemaining <= 0 &&
      store.repRestActive
    ) {
      const state = useTimerStore.getState();
      const restMs = Date.now() - (state.repRestStartedAt ?? Date.now());
      useTimerStore.setState({
        repRestActive: false,
        repRestStartedAt: null,
        repRestCount: state.repRestCount + 1,
        repRestTotalMs: state.repRestTotalMs + restMs,
        subActivityStartedAt: Date.now(),
      });
      repRestHasStarted.current = false;
      tickSound.play();
      mediumHaptic();
    }
  }, [repRestRemaining, store.repRestActive]);

  const handleRepRest = () => {
    const restSec = currentDef?.restDuration ?? 30;
    mediumHaptic();
    store.startRepRest(restSec);
  };

  const handleSkipRepRest = () => {
    const state = useTimerStore.getState();
    const restMs = Date.now() - (state.repRestStartedAt ?? Date.now());
    useTimerStore.setState({
      repRestActive: false,
      repRestStartedAt: null,
      repRestCount: state.repRestCount + 1,
      repRestTotalMs: state.repRestTotalMs + restMs,
      subActivityStartedAt: Date.now(),
    });
    mediumHaptic();
  };

  const handleFinishSubActivity = () => {
    successHaptic();
    store.finishSubActivity();
  };

  const handlePause = () => {
    mediumHaptic();
    store.pauseTimer();
  };

  const handleResume = () => {
    mediumHaptic();
    store.resumeTimer();
  };

  const handleEndSession = async () => {
    await store.discardSession();
    ToastAndroid.show("Session discarded", ToastAndroid.SHORT);
    router.back();
  };

  if (store.status === "finished") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.finishedScroll}>
          <View style={styles.finishedCard}>
            <View style={styles.finishedBadge}>
              <Text style={styles.finishedBadgeText}>COMPLETE</Text>
            </View>
            <Text style={styles.finishedName}>{store.sessionName}</Text>
            <Text style={styles.finishedTime}>
              {formatElapsedShort(sessionElapsed)}
            </Text>
            {(store.sessionTotalPauseMs > 0 || store.sessionTotalRestMs > 0) && (
              <Text style={styles.finishedMeta}>
                {store.sessionTotalPauseMs > 0
                  ? `${formatElapsedShort(store.sessionTotalPauseMs)} paused`
                  : ""}
                {store.sessionTotalPauseMs > 0 && store.sessionTotalRestMs > 0
                  ? " · "
                  : ""}
                {store.sessionTotalRestMs > 0
                  ? `${formatElapsedShort(store.sessionTotalRestMs)} rest`
                  : ""}
              </Text>
            )}
          </View>
          <CompletedList items={store.completedSubActivities} />
          <View style={styles.finishedActions}>
            <ActionButton
              label="Done"
              onPress={() => {
                store.reset();
                router.back();
              }}
              variant="primary"
              style={{ width: "100%" }}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.sessionName}>{store.sessionName}</Text>
          <View style={styles.headerMeta}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Total</Text>
              <Text style={styles.metaValue}>
                {formatElapsedShort(sessionElapsed)}
              </Text>
            </View>
            {pauseElapsed > 0 && (
              <View style={styles.metaItem}>
                <Text style={styles.metaPauseLabel}>Paused</Text>
                <Text style={styles.metaPauseValue}>
                  {formatElapsedShort(pauseElapsed)}
                </Text>
              </View>
            )}
            {store.sessionTotalRestMs > 0 && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Rest</Text>
                <Text style={styles.metaValue}>
                  {formatElapsedShort(store.sessionTotalRestMs)}
                </Text>
              </View>
            )}
            {totalSubs > 0 && (
              <View style={styles.progressPill}>
                <Text style={styles.progressText}>
                  {currentIndex} of {totalSubs}
                </Text>
              </View>
            )}
          </View>
        </View>

        {store.status === "rest" ? (
          <RestCountdown remainingMs={restRemaining} />
        ) : store.repRestActive ? (
          <View style={styles.repRestCard}>
            <Text style={styles.repRestLabel}>REP REST</Text>
            <Text style={styles.repRestName}>{currentDef?.name}</Text>
            <View style={styles.repRestCircle}>
              <Text style={styles.repRestCount}>
                {Math.ceil(repRestRemaining / 1000)}
              </Text>
            </View>
            <Text style={styles.repRestSub}>
              Rep {store.repRestCount + 1}
            </Text>
          </View>
        ) : currentDef ? (
          <TimerDisplay
            elapsedMs={elapsed}
            expectedMs={
              currentDef.expectedDuration
                ? currentDef.expectedDuration * 1000
                : undefined
            }
            label={currentDef.name}
            isRunning={store.status === "running"}
          />
        ) : null}

        <View style={styles.actions}>
          {store.repRestActive && (
            <ActionButton
              label="Skip"
              onPress={handleSkipRepRest}
              variant="primary"
              style={{ flex: 1 }}
            />
          )}
          {store.status === "running" && !store.repRestActive && (
            <>
              <ActionButton
                label="Rest"
                onPress={handleRepRest}
                variant="secondary"
                size="medium"
                style={{ flex: 1 }}
              />
              <ActionButton
                label="Pause"
                onPress={handlePause}
                variant="secondary"
                size="medium"
                style={{ flex: 1 }}
              />
              <ActionButton
                label="Done"
                onPress={handleFinishSubActivity}
                variant="success"
                size="medium"
                style={{ flex: 1 }}
              />
            </>
          )}
          {store.status === "paused" && (
            <>
              <ActionButton
                label="Resume"
                onPress={handleResume}
                variant="primary"
                style={{ flex: 1 }}
              />
              <ActionButton
                label="Done"
                onPress={handleFinishSubActivity}
                variant="success"
                style={{ flex: 1 }}
              />
            </>
          )}
        </View>

        <UpcomingList
          items={store.subActivityDefs}
          currentIndex={store.currentSubActivityIndex}
        />

        <CompletedList items={store.completedSubActivities} />
      </ScrollView>

      <View style={styles.footer}>
        <ActionButton
          label="End Session"
          onPress={handleEndSession}
          variant="danger"
          style={styles.endButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  sessionName: {
    ...typography.h1,
    color: colors.neutralDarkDarkest,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  metaLabel: {
    ...typography.bodyS,
    color: colors.textMuted,
  },
  metaValue: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
    fontVariant: ["tabular-nums"],
  },
  metaPauseLabel: {
    ...typography.bodyS,
    color: colors.warningDark,
  },
  metaPauseValue: {
    ...typography.h4,
    color: colors.warningDark,
    fontVariant: ["tabular-nums"],
  },
  progressPill: {
    backgroundColor: colors.primaryLightest,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  progressText: {
    ...typography.actionS,
    color: colors.primary,
  },
  repRestCard: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    marginVertical: spacing.lg,
  },
  repRestLabel: {
    ...typography.captionM,
    color: colors.warningDark,
  },
  repRestName: {
    ...typography.h3,
    color: colors.neutralDarkDarkest,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  repRestCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.warningDark,
    alignItems: "center",
    justifyContent: "center",
  },
  repRestCount: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.white,
  },
  repRestSub: {
    ...typography.bodyS,
    color: colors.warningDark,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
  },
  endButton: {
    width: "100%",
  },
  finishedScroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  finishedCard: {
    backgroundColor: colors.successLight,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  finishedBadge: {
    backgroundColor: colors.successDark,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  finishedBadgeText: {
    ...typography.captionM,
    color: colors.white,
  },
  finishedName: {
    ...typography.h1,
    color: colors.neutralDarkDarkest,
    textAlign: "center",
    marginTop: spacing.md,
  },
  finishedTime: {
    fontSize: 48,
    fontWeight: "800",
    color: colors.successDark,
    textAlign: "center",
    marginTop: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  finishedMeta: {
    ...typography.bodyM,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  finishedActions: {
    marginTop: spacing.xl,
  },
});
