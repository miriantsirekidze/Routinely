import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  getSessionsByName,
  getPreviousSessionTime,
  HistorySession,
} from "../../src/db/history";
import { formatElapsedShort, formatTime } from "../../src/utils/time";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function SessionHistoryScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const [allRuns, setAllRuns] = useState<HistorySession[]>([]);
  const [previousMs, setPreviousMs] = useState<number | null>(null);

  const decodedName = decodeURIComponent(name ?? "");

  useFocusEffect(
    useCallback(() => {
      if (decodedName) {
        getSessionsByName(decodedName).then(setAllRuns);
      }
      if (id) {
        getPreviousSessionTime(decodedName, Number(id)).then(setPreviousMs);
      }
    }, [id, decodedName])
  );

  const currentRun = allRuns.find((r) => r.id === Number(id));
  const otherRuns = allRuns.filter((r) => r.id !== Number(id));

  const delta =
    previousMs != null && currentRun
      ? currentRun.totalElapsedMs - previousMs
      : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>{decodedName}</Text>

        {currentRun && (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTime}>
                {formatElapsedShort(currentRun.totalElapsedMs)}
              </Text>
              {delta != null && (
                <View
                  style={[
                    styles.deltaBadge,
                    delta > 0 ? styles.deltaBadgeOver : styles.deltaBadgeUnder,
                  ]}
                >
                  <Text
                    style={[
                      styles.deltaText,
                      delta > 0 ? styles.deltaTextOver : styles.deltaTextUnder,
                    ]}
                  >
                    {delta > 0 ? "+" : "-"}
                    {formatElapsedShort(Math.abs(delta))} vs previous
                  </Text>
                </View>
              )}
              {currentRun.startedAt && currentRun.endedAt && (
                <Text style={styles.expectedText}>
                  {formatTime(new Date(currentRun.startedAt).getTime())} – {formatTime(new Date(currentRun.endedAt).getTime())}
                </Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Breakdown</Text>
              {currentRun.subActivities.map((sa, index) => {
                const isOver =
                  sa.expectedDuration != null &&
                  (sa.elapsedMs ?? 0) > sa.expectedDuration * 1000;
                return (
                  <Animated.View
                    key={sa.id}
                    entering={FadeInDown.delay(index * 40).duration(250)}
                    style={styles.subRow}
                  >
                    <View style={styles.subLeft}>
                      <View style={styles.subIndex}>
                        <Text style={styles.subIndexText}>{index + 1}</Text>
                      </View>
                      <View style={styles.subContent}>
                        <Text style={styles.subName}>{sa.name}</Text>
                        <Text style={styles.subTimestamp}>
                          {sa.startedAt && sa.endedAt
                            ? `${formatTime(new Date(sa.startedAt).getTime())} – ${formatTime(new Date(sa.endedAt).getTime())}`
                            : sa.expectedDuration != null
                            ? `expected ${formatElapsedShort(sa.expectedDuration * 1000)}`
                            : ""}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[styles.subTime, isOver && styles.subTimeOver]}
                    >
                      {formatElapsedShort(sa.elapsedMs ?? 0)}
                    </Text>
                  </Animated.View>
                );
              })}
            </View>
          </>
        )}

        {otherRuns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Previous Runs ({otherRuns.length})
            </Text>
            {otherRuns.map((run, index) => (
              <Animated.View
                key={run.id}
                entering={FadeInDown.delay(index * 40).duration(250)}
              >
                <Pressable
                  style={styles.runCard}
                  onPress={() =>
                    router.push(
                      `/history/session?id=${run.id}&name=${encodeURIComponent(run.name)}`
                    )
                  }
                >
                  <View style={styles.runLeft}>
                    <Text style={styles.runDate}>
                      {run.startedAt
                        ? new Date(run.startedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </Text>
                    <Text style={styles.runSubs}>
                      {run.subActivities.length} activities
                    </Text>
                  </View>
                  <Text style={styles.runTime}>
                    {formatElapsedShort(run.totalElapsedMs)}
                  </Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
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
    paddingBottom: spacing.xxl,
  },
  backBtn: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backText: {
    ...typography.actionL,
    color: colors.primary,
  },
  title: {
    ...typography.h1,
    color: colors.neutralDarkDarkest,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  summaryTime: {
    fontSize: 48,
    fontWeight: "800",
    color: colors.neutralDarkDarkest,
    fontVariant: ["tabular-nums"],
  },
  deltaBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: spacing.sm,
  },
  deltaBadgeOver: {
    backgroundColor: colors.warningLight,
  },
  deltaBadgeUnder: {
    backgroundColor: colors.successLight,
  },
  deltaText: {
    ...typography.actionS,
  },
  deltaTextOver: {
    color: colors.warningDark,
  },
  deltaTextUnder: {
    color: colors.successDark,
  },
  expectedText: {
    ...typography.bodyS,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionLabel: {
    ...typography.h4,
    color: colors.neutralDarkMedium,
    marginBottom: spacing.md,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  subLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  subIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.neutralLight,
    alignItems: "center",
    justifyContent: "center",
  },
  subIndexText: {
    ...typography.h5,
    color: colors.neutralDarkMedium,
  },
  subContent: {
    flex: 1,
  },
  subName: {
    ...typography.bodyM,
    color: colors.neutralDarkDarkest,
  },
  subTimestamp: {
    ...typography.bodyXS,
    color: colors.textMuted,
    marginTop: 2,
  },
  subTime: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
    fontVariant: ["tabular-nums"],
  },
  subTimeOver: {
    color: colors.warningDark,
  },
  runCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  runLeft: {
    flex: 1,
  },
  runDate: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
  },
  runSubs: {
    ...typography.bodyXS,
    color: colors.textSecondary,
    marginTop: 2,
  },
  runTime: {
    ...typography.h4,
    color: colors.neutralDarkMedium,
    fontVariant: ["tabular-nums"],
  },
});
