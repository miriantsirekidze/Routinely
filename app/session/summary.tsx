import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { File, Directory, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ToastAndroid } from "react-native";
import { useSettingsStore } from "../../src/stores/settingsStore";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  getTodaySummary,
  finishDay,
  generateCsv,
  DaySummary,
} from "../../src/db/dayExport";
import { ActionButton } from "../../src/components/ActionButton";
import { Accordion } from "../../src/components/Accordion";
import { recordDayCompleted } from "../../src/db/streaks";
import { formatElapsedShort, formatDuration } from "../../src/utils/time";
import { successHaptic } from "../../src/utils/feedback";
import { useSound } from "../../src/hooks/useSound";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function DaySummaryScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const dayCompleteSound = useSound("dayComplete");
  const csvFolderUri = useSettingsStore((s) => s.dailyCsvFolderUri);

  useEffect(() => {
    getTodaySummary().then(setSummary);
  }, []);

  const handleFinishDay = async () => {
    if (!summary || summary.sessionCount === 0) {
      ToastAndroid.show("Complete at least one session first", ToastAndroid.SHORT);
      return;
    }

    await finishDay();
    await recordDayCompleted();
    successHaptic();
    dayCompleteSound.play();

    const csv = generateCsv(summary);
    const fileName = `${summary.date}.csv`;

    if (csvFolderUri) {
      const cacheFile = new File(Paths.cache, fileName);
      if (cacheFile.exists) cacheFile.delete();
      cacheFile.write(csv);
      const dir = new Directory(csvFolderUri);
      try {
        const existing = dir.list();
        for (const item of existing) {
          if (item instanceof File && item.name === fileName) {
            item.delete();
            break;
          }
        }
      } catch (_) {}
      await cacheFile.copy(dir);
      if (cacheFile.exists) cacheFile.delete();
      ToastAndroid.show(`Exported ${fileName}`, ToastAndroid.SHORT);
    } else {
      const file = new File(Paths.cache, fileName);
      if (file.exists) file.delete();
      file.write(csv);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/csv",
          dialogTitle: `Export ${summary.date}`,
        });
      }
    }

    router.back();
  };

  if (!summary) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Daily Summary</Text>
        <Text style={styles.date}>{summary.date}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {formatElapsedShort(summary.totalActiveMs)}
            </Text>
            <Text style={styles.statLabel}>Active Time</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{summary.sessionCount}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {summary.totalPauseMs > 0
                ? formatElapsedShort(summary.totalPauseMs)
                : "0:00"}
            </Text>
            <Text style={styles.statLabel}>Paused</Text>
          </View>
        </View>

        {summary.sessions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Sessions</Text>
            {summary.sessions.map((session, sIndex) => {
              const isOver =
                session.expectedDuration != null &&
                session.totalMs > session.expectedDuration * 1000;
              return (
                <Animated.View
                  key={sIndex}
                  entering={FadeInDown.delay(sIndex * 60).duration(250)}
                >
                  <Accordion
                    header={
                      <View style={styles.sessionRow}>
                        <View style={styles.sessionIcon}>
                          <Text style={styles.sessionIconText}>
                            {session.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.sessionContent}>
                          <Text style={styles.sessionName}>
                            {session.name}
                          </Text>
                          <Text style={styles.sessionMeta}>
                            {session.subActivities.length} activities
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.sessionTime,
                            isOver && styles.sessionTimeOver,
                          ]}
                        >
                          {formatElapsedShort(session.totalMs)}
                        </Text>
                      </View>
                    }
                  >
                    {session.subActivities.map((sa, saIndex) => (
                      <View key={saIndex} style={styles.subRow}>
                        <View style={styles.subLeft}>
                          <View style={styles.subDot} />
                          <Text style={styles.subName}>{sa.name}</Text>
                        </View>
                        <Text style={styles.subTime}>
                          {formatElapsedShort(sa.elapsedMs)}
                        </Text>
                      </View>
                    ))}
                  </Accordion>
                </Animated.View>
              );
            })}
          </View>
        )}

        {summary.sessionCount === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No completed sessions today
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <ActionButton
          label="Back"
          onPress={() => router.back()}
          variant="secondary"
          style={{ flex: 1 }}
        />
        <ActionButton
          label="Finish Day"
          onPress={handleFinishDay}
          variant="primary"
          style={{ flex: 1 }}
          disabled={summary.sessionCount === 0}
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
    paddingBottom: 120,
  },
  title: {
    ...typography.h1,
    color: colors.neutralDarkDarkest,
    marginTop: spacing.lg,
  },
  date: {
    ...typography.bodyM,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  statValue: {
    ...typography.h3,
    color: colors.neutralDarkDarkest,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    ...typography.bodyXS,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionLabel: {
    ...typography.h4,
    color: colors.neutralDarkMedium,
    marginBottom: spacing.md,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLightest,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionIconText: {
    ...typography.h3,
    color: colors.primary,
  },
  sessionContent: {
    flex: 1,
  },
  sessionName: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
  },
  sessionMeta: {
    ...typography.bodyXS,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sessionTime: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
    fontVariant: ["tabular-nums"],
  },
  sessionTimeOver: {
    color: colors.warningDark,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingLeft: spacing.sm,
  },
  subLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  subDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neutralLightDark,
  },
  subName: {
    ...typography.bodyS,
    color: colors.neutralDarkLight,
    flex: 1,
  },
  subTime: {
    ...typography.bodyS,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  emptyState: {
    paddingTop: spacing.xxl,
    alignItems: "center",
  },
  emptyStateText: {
    ...typography.bodyM,
    color: colors.textMuted,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    ...typography.bodyM,
    color: colors.textMuted,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.neutralLight,
  },
});
