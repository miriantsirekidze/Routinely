import { useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { getHistoryDays, deleteSession, HistoryDay, HistorySession } from "../../src/db/history";
import { useCachedQuery } from "../../src/db/queryCache";
import { Accordion } from "../../src/components/Accordion";
import { DeleteConfirmSheet, DeleteConfirmSheetRef } from "../../src/components/DeleteConfirmSheet";
import { formatElapsedShort } from "../../src/utils/time";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function HistoryScreen() {
  const router = useRouter();
  const { data: history = [], refresh } = useCachedQuery<HistoryDay[]>(
    "history:days",
    getHistoryDays
  );
  const deleteSheetRef = useRef<DeleteConfirmSheetRef>(null);
  const pendingDeleteRef = useRef<(() => Promise<void>) | null>(null);

  const sections = useMemo(
    () =>
      history.map((day) => ({
        title: day.date,
        finishedAt: day.finishedAt,
        data: day.sessions,
      })),
    [history]
  );

  const formatDate = useCallback((dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split("T")[0]) return "Today";
    if (dateStr === yesterday.toISOString().split("T")[0]) return "Yesterday";

    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, []);

  const renderSession = useCallback(({
    item,
    index,
  }: {
    item: HistorySession;
    index: number;
  }) => (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(250)}>
      <Accordion
        header={
          <Pressable
            style={styles.sessionRow}
            onPress={() =>
              router.push(
                `/history/session?id=${item.id}&name=${encodeURIComponent(item.name)}`
              )
            }
            onLongPress={() => {
              pendingDeleteRef.current = async () => {
                await deleteSession(item.id);
                refresh();
              };
              deleteSheetRef.current?.present(item.name);
            }}
          >
            <View style={styles.sessionIcon}>
              <Text style={styles.sessionIconText}>
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
        {item.subActivities.map((sa, saIndex) => {
          const isOver =
            sa.expectedDuration != null &&
            (sa.elapsedMs ?? 0) > sa.expectedDuration * 1000;
          return (
            <View key={sa.id} style={styles.subRow}>
              <View style={styles.subLeft}>
                <View style={styles.subDot} />
                <Text style={styles.subName}>{sa.name}</Text>
              </View>
              <Text style={[styles.subTime, isOver && styles.subTimeOver]}>
                {formatElapsedShort(sa.elapsedMs ?? 0)}
              </Text>
            </View>
          );
        })}
        <Pressable
          style={styles.viewDetailBtn}
          onPress={() =>
            router.push(
              `/history/session?id=${item.id}&name=${encodeURIComponent(item.name)}`
            )
          }
        >
          <Text style={styles.viewDetailText}>View Details →</Text>
        </Pressable>
      </Accordion>
    </Animated.View>
  ), [router, refresh]);

  const renderSectionHeader = useCallback(({
    section,
  }: {
    section: { title: string };
  }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionDate}>{formatDate(section.title)}</Text>
      <Text style={styles.sectionDateFull}>{section.title}</Text>
    </View>
  ), [formatDate]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>History</Text>
          <Pressable
            style={styles.trendsBtn}
            onPress={() => router.push("/history/trends")}
          >
            <Text style={styles.trendsBtnText}>Trends</Text>
          </Pressable>
        </View>
      </View>

      {history.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>0</Text>
          </View>
          <Text style={styles.emptyText}>No history yet</Text>
          <Text style={styles.emptySubtext}>
            Completed sessions will appear here
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderSession}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}
      <DeleteConfirmSheet
        ref={deleteSheetRef}
        onConfirm={() => pendingDeleteRef.current?.()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    ...typography.h1,
    color: colors.neutralDarkDarkest,
  },
  trendsBtn: {
    backgroundColor: colors.primaryLightest,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  trendsBtnText: {
    ...typography.actionM,
    color: colors.primary,
  },
  list: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionDate: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
  },
  sectionDateFull: {
    ...typography.bodyS,
    color: colors.textMuted,
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
  },
  subTime: {
    ...typography.bodyS,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  subTimeOver: {
    color: colors.warningDark,
  },
  viewDetailBtn: {
    paddingTop: spacing.sm,
    paddingLeft: spacing.sm,
  },
  viewDetailText: {
    ...typography.actionS,
    color: colors.primary,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyIconText: {
    ...typography.h2,
    color: colors.neutralLightDark,
  },
  emptyText: {
    ...typography.h3,
    color: colors.neutralDarkLight,
  },
  emptySubtext: {
    ...typography.bodyM,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
