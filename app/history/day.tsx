import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ToastAndroid,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { PieChart } from "react-native-gifted-charts";
import { getHistoryDays, HistorySession } from "../../src/db/history";
import { Accordion } from "../../src/components/Accordion";
import { ActionButton } from "../../src/components/ActionButton";
import { getSummaryForDate, generateCsv } from "../../src/db/dayExport";
import { useSettingsStore } from "../../src/stores/settingsStore";
import { File, Directory, Paths } from "expo-file-system";
import { formatElapsedShort } from "../../src/utils/time";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

const CHART_COLORS = [
  colors.primary,
  colors.successMedium,
  colors.warningMedium,
  colors.primaryLight,
  colors.errorMedium,
  colors.successDark,
  colors.warningDark,
  colors.primaryMedium,
];

export default function DayHistoryScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const [sessions, setSessions] = useState<HistorySession[]>([]);

  useFocusEffect(
    useCallback(() => {
      getHistoryDays().then((days) => {
        const day = days.find((d) => d.date === date);
        setSessions(day?.sessions ?? []);
      });
    }, [date])
  );

  const displayDate = date
    ? new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "";

  const totalMs = sessions.reduce((sum, s) => sum + s.totalElapsedMs, 0);

  const pieData = sessions.map((s, i) => ({
    value: Math.max(s.totalElapsedMs, 1),
    color: CHART_COLORS[i % CHART_COLORS.length],
    text: "",
  }));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>{displayDate}</Text>
        <Text style={styles.subtitle}>
          {sessions.length} session{sessions.length !== 1 ? "s" : ""} ·{" "}
          {formatElapsedShort(totalMs)} total
        </Text>

        {sessions.length > 0 && (
          <View style={styles.chartCard}>
            <View style={styles.chartCenter}>
              <PieChart
                data={pieData}
                donut
                radius={70}
                innerRadius={50}
                innerCircleColor={colors.surface}
                centerLabelComponent={() => (
                  <View style={styles.centerLabel}>
                    <Text style={styles.centerTime}>
                      {formatElapsedShort(totalMs)}
                    </Text>
                    <Text style={styles.centerSub}>total</Text>
                  </View>
                )}
              />
            </View>
            <View style={styles.legend}>
              {sessions.map((s, i) => {
                const pct =
                  totalMs > 0
                    ? Math.round((s.totalElapsedMs / totalMs) * 100)
                    : 0;
                return (
                  <View key={s.id} style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendDot,
                        {
                          backgroundColor:
                            CHART_COLORS[i % CHART_COLORS.length],
                        },
                      ]}
                    />
                    <Text style={styles.legendName} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text style={styles.legendValue}>
                      {formatElapsedShort(s.totalElapsedMs)} · {pct}%
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {sessions.length > 0 && (
          <View style={styles.exportRow}>
            <ActionButton
              label="Export CSV"
              variant="secondary"
              size="medium"
              style={{ flex: 1 }}
              onPress={async () => {
                if (!date) return;
                const summary = await getSummaryForDate(date);
                if (!summary || summary.sessionCount === 0) {
                  ToastAndroid.show("No data to export", ToastAndroid.SHORT);
                  return;
                }
                const csv = generateCsv(summary);
                const fileName = `${date}.csv`;
                const csvFolder = useSettingsStore.getState().dailyCsvFolderUri;
                if (csvFolder) {
                  const cacheFile = new File(Paths.cache, fileName);
                  if (cacheFile.exists) cacheFile.delete();
                  cacheFile.write(csv);
                  const dir = new Directory(csvFolder);
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
                  const Sharing = require("expo-sharing");
                  const canShare = await Sharing.isAvailableAsync();
                  if (canShare) await Sharing.shareAsync(file.uri, { mimeType: "text/csv" });
                }
              }}
            />
          </View>
        )}

        {sessions.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No sessions recorded</Text>
          </View>
        ) : (
          <View style={styles.sessionList}>
            <Text style={styles.sectionLabel}>Sessions</Text>
            {sessions.map((item, index) => (
              <Animated.View
                key={item.id}
                entering={FadeInDown.delay(index * 50).duration(250)}
              >
                <Accordion
                  header={
                    <Pressable
                      style={styles.sessionRow}
                      onPress={() =>
                        router.push(
                          `/history/session?id=${item.id}&name=${encodeURIComponent(item.name)}`
                        )
                      }
                    >
                      <View
                        style={[
                          styles.sessionIcon,
                          {
                            backgroundColor:
                              CHART_COLORS[index % CHART_COLORS.length] + "20",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sessionIconText,
                            {
                              color:
                                CHART_COLORS[index % CHART_COLORS.length],
                            },
                          ]}
                        >
                          {item.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.sessionContent}>
                        <Text style={styles.sessionName}>{item.name}</Text>
                        <Text style={styles.sessionMeta}>
                          {item.subActivities.length} activities
                        </Text>
                      </View>
                      <Text style={styles.sessionTime}>
                        {formatElapsedShort(item.totalElapsedMs)}
                      </Text>
                    </Pressable>
                  }
                >
                  {item.subActivities.map((sa) => (
                    <View key={sa.id} style={styles.subRow}>
                      <View style={styles.subDot} />
                      <Text style={styles.subName}>{sa.name}</Text>
                      <Text style={styles.subTime}>
                        {formatElapsedShort(sa.elapsedMs ?? 0)}
                      </Text>
                    </View>
                  ))}
                </Accordion>
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
  subtitle: {
    ...typography.bodyM,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  chartCenter: {
    alignItems: "center",
  },
  centerLabel: {
    alignItems: "center",
  },
  centerTime: {
    ...typography.h3,
    color: colors.neutralDarkDarkest,
    fontVariant: ["tabular-nums"],
  },
  centerSub: {
    ...typography.bodyXS,
    color: colors.textMuted,
  },
  legend: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendName: {
    ...typography.bodyM,
    color: colors.neutralDarkDarkest,
    flex: 1,
  },
  legendValue: {
    ...typography.bodyS,
    color: colors.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  exportRow: {
    marginTop: spacing.md,
  },
  sectionLabel: {
    ...typography.h4,
    color: colors.neutralDarkMedium,
    marginBottom: spacing.md,
  },
  sessionList: {
    marginTop: spacing.lg,
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
    alignItems: "center",
    justifyContent: "center",
  },
  sessionIconText: {
    ...typography.h3,
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
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingLeft: spacing.sm,
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
    marginLeft: spacing.sm,
  },
  subTime: {
    ...typography.bodyS,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  empty: {
    paddingTop: spacing.xxl,
    alignItems: "center",
  },
  emptyText: {
    ...typography.bodyM,
    color: colors.textMuted,
  },
});
