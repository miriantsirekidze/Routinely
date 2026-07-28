import { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTimerStore } from "../../src/stores/timerStore";
import { getAllTemplates, TemplateWithSubs } from "../../src/db/templates";
import {
  getScheduleForDay,
  ScheduleEntry,
} from "../../src/db/schedule";
import { ActionButton } from "../../src/components/ActionButton";
import { ActivityHeatmap } from "../../src/components/ActivityHeatmap";
import { TrackerCard } from "../../src/components/TrackerCard";
import { getStreakData, StreakData } from "../../src/db/streaks";
import { getSuggestions, Suggestion } from "../../src/db/suggestions";
import { getHeatmapData, HeatmapData } from "../../src/db/heatmap";
import { getTrackers, Tracker } from "../../src/db/trackers";
import { getUpcomingEvents, CalendarEvent } from "../../src/db/events";
import { localDateStr, formatShortDate, parseDateBadge } from "../../src/utils/date";
import { titleCase } from "../../src/utils/text";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

function daysUntilLabel(startDate: string): string {
  const today = localDateStr(new Date());
  if (startDate === today) return "today";
  const tomorrow = localDateStr(new Date(Date.now() + 86400000));
  if (startDate === tomorrow) return "tomorrow";
  const diff = Math.round(
    (new Date(startDate + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) /
      86400000
  );
  return `in ${diff} days`;
}

export default function TodayScreen() {
  const router = useRouter();
  const status = useTimerStore((s) => s.status);
  const [templates, setTemplates] = useState<TemplateWithSubs[]>([]);
  const [todaySchedule, setTodaySchedule] = useState<ScheduleEntry[]>([]);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [upNext, setUpNext] = useState<Suggestion[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const todayDay = new Date().getDay();

  const fetchAll = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    return Promise.all([
        getAllTemplates().then(setTemplates),
        getScheduleForDay(todayDay).then(setTodaySchedule),
        getStreakData().then(setStreak),
        getSuggestions(20).then(setUpNext),
        getHeatmapData().then(setHeatmap),
        getTrackers().then(setTrackers),
        getUpcomingEvents(3).then(setUpcomingEvents),
      ]).finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [todayDay]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  // Re-fetch tracker elapsed every 60 s while the screen is mounted
  useEffect(() => {
    const interval = setInterval(() => {
      getTrackers().then(setTrackers);
    }, 60000);
    return () => clearInterval(interval);
  }, []);


  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const hasActiveSession = status !== "idle" && status !== "finished";

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchAll(true)}
            colors={[colors.green]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>Today</Text>
          <Text style={styles.date}>{today}</Text>
        </View>

        {heatmap && (
          <View style={styles.heatmapSection}>
            <View style={styles.heatmapHeader}>
              <View>
                <Text style={styles.heatmapTotal}>
                  {Math.floor(heatmap.totalMs / 3600000)}h{" "}
                  {Math.floor((heatmap.totalMs % 3600000) / 60000)}m tracked
                </Text>
                <Text style={styles.heatmapMeta}>
                  {heatmap.totalSessions} sessions · {heatmap.activeDays} active days
                </Text>
              </View>
              {streak && streak.currentStreak > 0 && (
                <View style={styles.streakRow}>
                  <Text style={styles.streakFire}>🔥</Text>
                  <Text style={styles.streakNumber}>{streak.currentStreak}</Text>
                </View>
              )}
            </View>
            <View style={styles.heatmapGrid}>
              <ActivityHeatmap
                data={heatmap.days}
                onDayPress={(date) => router.push(`/history/day?date=${date}`)}
              />
            </View>
          </View>
        )}

        {/* Trackers */}
        {trackers.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Trackers</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trackerRow}
            >
              {trackers.map((tracker) => (
                <TrackerCard
                  key={tracker.id}
                  tracker={tracker}
                  onPress={() => router.push(`/trackers/${tracker.id}`)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Upcoming events */}
        {upcomingEvents.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming</Text>
            </View>
            {upcomingEvents.map((event, index) => {
              const badge = parseDateBadge(event.startDate);
              const isMultiDay = event.startDate !== event.endDate;
              const isToday = event.startDate === localDateStr(new Date());
              const rangeStr = isMultiDay
                ? `${formatShortDate(event.startDate)} – ${formatShortDate(event.endDate)}`
                : null;
              const whenLabel = isToday
                ? rangeStr
                : [daysUntilLabel(event.startDate), rangeStr].filter(Boolean).join(" · ");
              return (
                <Animated.View
                  key={event.id}
                  entering={FadeInDown.delay(index * 40).duration(250)}
                >
                  <Pressable
                    style={styles.upcomingRow}
                    onPress={() => router.push(`/events/${event.id}`)}
                  >
                    <View style={styles.upcomingBadge}>
                      <Text style={styles.upcomingBadgeMonth}>{badge.month}</Text>
                      <Text style={styles.upcomingBadgeDay}>{badge.day}</Text>
                    </View>
                    <View style={styles.upcomingContent}>
                      <Text style={styles.upcomingTitle}>{titleCase(event.title)}</Text>
                      {whenLabel ? (
                        <Text style={styles.upcomingWhen}>{whenLabel}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        )}

        {upNext.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Up Next</Text>
            </View>
            {upNext.map((suggestion, index) => (
              <Animated.View
                key={suggestion.templateId}
                entering={FadeInDown.delay(index * 50).duration(250)}
              >
                <Pressable
                  style={styles.suggestionCard}
                  onPress={() =>
                    router.push(`/session/new?templateId=${suggestion.templateId}`)
                  }
                >
                  <View style={styles.suggestionLeft}>
                    <View style={styles.suggestionIcon}>
                      <Text style={styles.suggestionIconText}>
                        {suggestion.templateName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.suggestionContent}>
                      <Text style={styles.suggestionName}>
                        {suggestion.templateName}
                      </Text>
                      <Text style={styles.suggestionTime}>
                        Usually at {suggestion.typicalTime}
                        {suggestion.minutesFromNow > 0
                          ? ` · in ${suggestion.minutesFromNow}m`
                          : suggestion.minutesFromNow === 0
                          ? " · now"
                          : ` · ${Math.abs(suggestion.minutesFromNow)}m ago`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.startChip}>
                    <Text style={styles.startChipText}>Start</Text>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        )}

        {templates.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Quick Start</Text>
            </View>
            <FlatList
              data={templates}
              keyExtractor={(item) => String(item.id)}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.templateList}
              scrollEnabled={true}
              renderItem={({ item, index }) => (
                <Animated.View
                  entering={FadeInDown.delay(index * 60).duration(300)}
                >
                  <Pressable
                    style={styles.templateCard}
                    onPress={() =>
                      router.push(`/session/new?templateId=${item.id}`)
                    }
                  >
                    <View style={styles.templateIcon}>
                      <Text style={styles.templateIconText}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.templateName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.templateMeta}>
                      {item.subActivities.length} activities
                    </Text>
                  </Pressable>
                </Animated.View>
              )}
            />
          </View>
        )}

        {todaySchedule.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Scheduled</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{todaySchedule.length}</Text>
              </View>
              <Pressable
                onPress={() => router.push("/templates")}
                style={{ marginLeft: "auto" }}
              >
                <Text style={styles.seeAllText}>Templates →</Text>
              </Pressable>
            </View>
            {todaySchedule.map((entry, index) => (
              <Animated.View
                key={entry.id}
                entering={FadeInDown.delay(index * 50).duration(250)}
              >
                <Pressable
                  style={styles.scheduleCard}
                  onPress={() =>
                    router.push(`/session/new?templateId=${entry.templateId}`)
                  }
                >
                  <View style={styles.scheduleLeft}>
                    <View style={styles.scheduleOrder}>
                      <Text style={styles.scheduleOrderText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.scheduleName}>{entry.templateName}</Text>
                  </View>
                  <View style={styles.startChip}>
                    <Text style={styles.startChipText}>Start</Text>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        )}

        {!hasActiveSession &&
          templates.length === 0 &&
          todaySchedule.length === 0 && (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyIconText}>+</Text>
              </View>
              <Text style={styles.emptyText}>No sessions yet</Text>
              <Text style={styles.emptySubtext}>
                Start a new session or create a template first
              </Text>
            </View>
          )}
      </ScrollView>

      <View style={styles.footer}>
        {hasActiveSession ? (
          <ActionButton
            label="Resume Session"
            onPress={() => router.push("/session/active")}
            variant="success"
            style={styles.fullButton}
          />
        ) : (
          <View style={styles.footerRow}>
            <ActionButton
              label="Finish Day"
              onPress={() => router.push("/session/summary")}
              variant="secondary"
              size="medium"
              style={{ flex: 1 }}
            />
            <ActionButton
              label="New Session"
              onPress={() => router.push("/session/new")}
              variant="primary"
              size="medium"
              style={{ flex: 2 }}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 100 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { paddingTop: spacing.lg, paddingHorizontal: spacing.lg },
  heatmapSection: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  heatmapHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  streakFire: { fontSize: 14 },
  streakNumber: { ...typography.h2, color: colors.warningDark },
  heatmapTotal: { ...typography.h3, color: colors.neutralDarkDarkest },
  heatmapMeta: { ...typography.bodyS, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md },
  heatmapGrid: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  greeting: { ...typography.h1, color: colors.neutralDarkDarkest },
  date: { ...typography.bodyM, color: colors.textSecondary, marginTop: spacing.xs },
  section: { marginTop: spacing.xl },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h4, color: colors.neutralDarkDarkest },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.primaryLightest,
  },
  countPillText: { ...typography.h5, color: colors.primary },
  seeAllText: { ...typography.actionS, color: colors.primary },
  trackerRow: { gap: 8, paddingHorizontal: spacing.lg },
  // Upcoming events
  upcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  upcomingBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingBadgeMonth: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  upcomingBadgeDay: { ...typography.h3, color: colors.white, lineHeight: 20 },
  upcomingContent: { flex: 1 },
  upcomingTitle: { ...typography.h4, color: colors.neutralDarkDarkest },
  upcomingWhen: { ...typography.bodyXS, color: colors.green, marginTop: 2, fontWeight: "600" },
  // Up Next (suggestions)
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.successLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  suggestionLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  suggestionIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.successDark, alignItems: "center", justifyContent: "center",
  },
  suggestionIconText: { ...typography.h3, color: colors.white },
  suggestionContent: { flex: 1 },
  suggestionName: { ...typography.h4, color: colors.successDark },
  suggestionTime: { ...typography.bodyXS, color: colors.successDark, marginTop: 2, opacity: 0.7 },
  // Schedule
  scheduleCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primaryLightest,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  scheduleLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  scheduleOrder: {
    width: 32, height: 32, borderRadius: radius.md,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
  },
  scheduleOrderText: { ...typography.h5, color: colors.white },
  scheduleName: { ...typography.h4, color: colors.primary, flex: 1 },
  startChip: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
  startChipText: { ...typography.actionS, color: colors.white },
  // Quick Start
  templateList: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  templateCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, width: 150 },
  templateIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.primaryLightest, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm,
  },
  templateIconText: { ...typography.h3, color: colors.primary },
  templateName: { ...typography.h4, color: colors.neutralDarkDarkest },
  templateMeta: { ...typography.bodyXS, color: colors.textSecondary, marginTop: 2 },
  // Empty
  empty: { paddingTop: 120, alignItems: "center", paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  emptyIconText: { fontSize: 24, fontWeight: "700", color: colors.neutralLightDark },
  emptyText: { ...typography.h3, color: colors.neutralDarkLight },
  emptySubtext: { ...typography.bodyM, color: colors.textMuted, marginTop: spacing.xs, textAlign: "center" },
  // Footer
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.md,
    backgroundColor: colors.background,
  },
  fullButton: { width: "100%" },
  footerRow: { flexDirection: "row", gap: spacing.sm },
});
