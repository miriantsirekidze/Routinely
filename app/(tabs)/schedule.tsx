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
import { useRouter, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  getFullSchedule,
  removeFromSchedule,
  getDayName,
  getDayShort,
  ScheduleEntry,
} from "../../src/db/schedule";
import { getEventsForMonth, CalendarEvent } from "../../src/db/events";
import { Accordion } from "../../src/components/Accordion";
import { MonthCalendar } from "../../src/components/MonthCalendar";
import { formatDuration } from "../../src/utils/time";
import { formatShortDate, parseDateBadge, localDateStr } from "../../src/utils/date";
import { titleCase } from "../../src/utils/text";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function PlanScreen() {
  const router = useRouter();
  const [schedule, setSchedule] = useState<Record<number, ScheduleEntry[]>>({});
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const today = new Date().getDay();

  useFocusEffect(
    useCallback(() => {
      getFullSchedule().then(setSchedule);
      getEventsForMonth(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth()
      ).then(setEvents);
    }, [calendarMonth])
  );

  const goToPrevMonth = () =>
    setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));

  const goToNextMonth = () =>
    setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const handleRemove = async (entry: ScheduleEntry) => {
    await removeFromSchedule(entry.id);
    getFullSchedule().then(setSchedule);
    ToastAndroid.show("Removed", ToastAndroid.SHORT);
  };

  const monthLabel = calendarMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Plan</Text>
        </View>

        {/* ── Calendar section ── */}
        <View style={styles.section}>
          <View style={styles.monthNav}>
            <Pressable style={styles.navBtn} onPress={goToPrevMonth}>
              <Text style={styles.navBtnText}>{"‹"}</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable style={styles.navBtn} onPress={goToNextMonth}>
              <Text style={styles.navBtnText}>{"›"}</Text>
            </Pressable>
          </View>

          <View style={styles.calendarCard}>
            <MonthCalendar
              year={calendarMonth.getFullYear()}
              month={calendarMonth.getMonth()}
              events={events}
              onDayPress={(date) => router.push(`/events/day?date=${date}`)}
            />
          </View>

          {/* Only show events that are today or in the future in the list.
              Past events still show as dots on the calendar — tap the date to see them. */}
          {events.filter((e) => e.endDate >= localDateStr(new Date())).length > 0 && (
            <View style={styles.eventsList}>
              {events.filter((e) => e.endDate >= localDateStr(new Date())).map((event) => {
                const badge = parseDateBadge(event.startDate);
                const isMultiDay = event.startDate !== event.endDate;
                return (
                  <Pressable
                    key={event.id}
                    style={styles.eventRow}
                    onPress={() => router.push(`/events/${event.id}`)}
                  >
                    <View style={styles.dateBadge}>
                      <Text style={styles.badgeMonth}>{badge.month}</Text>
                      <Text style={styles.badgeDay}>{badge.day}</Text>
                    </View>
                    <View style={styles.eventContent}>
                      <Text
                        style={[
                          styles.eventTitle,
                          event.completed && styles.eventTitleDone,
                        ]}
                      >
                        {titleCase(event.title)}
                      </Text>
                      {isMultiDay && (
                        <Text style={styles.eventDates}>
                          {formatShortDate(event.startDate)} – {formatShortDate(event.endDate)}
                        </Text>
                      )}
                    </View>
                    {event.completed && (
                      <Text style={styles.eventDone}>✓</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Schedule section ── */}
        <View style={styles.sectionDivider} />

        <View style={styles.scheduleSection}>
          <Text style={styles.sectionTitle}>Weekly Schedule</Text>

          {[0, 1, 2, 3, 4, 5, 6].map((day, dayIndex) => {
            const entries = schedule[day] ?? [];
            const isToday = day === today;
            const totalDuration = entries.reduce(
              (sum, e) => sum + (e.expectedDuration ?? 0),
              0
            );

            return (
              <Animated.View
                key={day}
                entering={FadeInDown.delay(dayIndex * 40).duration(250)}
                style={{ marginHorizontal: spacing.lg }}
              >
                <Accordion
                  defaultOpen={isToday}
                  header={
                    <View style={styles.dayHeader}>
                      <View style={styles.dayLeft}>
                        <View
                          style={[
                            styles.dayBadge,
                            isToday && styles.dayBadgeToday,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayBadgeText,
                              isToday && styles.dayBadgeTextToday,
                            ]}
                          >
                            {getDayShort(day)}
                          </Text>
                        </View>
                        <View>
                          <Text
                            style={[
                              styles.dayName,
                              isToday && styles.dayNameToday,
                            ]}
                          >
                            {getDayName(day)}
                          </Text>
                          <Text style={styles.dayMeta}>
                            {entries.length} session
                            {entries.length !== 1 ? "s" : ""}
                            {totalDuration > 0
                              ? ` · ${formatDuration(totalDuration)}`
                              : ""}
                          </Text>
                        </View>
                      </View>
                    </View>
                  }
                >
                  {entries.length > 0 ? (
                    <View>
                      {entries.map((entry) => (
                        <Pressable
                          key={entry.id}
                          style={styles.entryRow}
                          onPress={() =>
                            router.push(
                              `/session/new?templateId=${entry.templateId}`
                            )
                          }
                          onLongPress={() => handleRemove(entry)}
                        >
                          {entry.expectedDuration ? (
                            <View style={styles.durationBadge}>
                              <Text style={styles.durationText}>
                                {formatDuration(entry.expectedDuration)}
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.entryDot} />
                          )}
                          <Text style={styles.entryName}>
                            {entry.templateName}
                          </Text>
                        </Pressable>
                      ))}
                      <Pressable
                        style={styles.editDayBtn}
                        onPress={() =>
                          router.push(`/schedule/day?day=${day}`)
                        }
                      >
                        <Text style={styles.editDayText}>Edit day →</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.addFirstBtn}
                      onPress={() =>
                        router.push(`/schedule/day?day=${day}`)
                      }
                    >
                      <Text style={styles.addFirstText}>+ Add templates</Text>
                    </Pressable>
                  )}
                </Accordion>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  header: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  title: { ...typography.h1, color: colors.neutralDarkDarkest },
  // Calendar section
  section: { paddingHorizontal: spacing.lg },
  monthNav: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  navBtnText: { fontSize: 20, color: colors.neutralDarkMedium, lineHeight: 24 },
  monthLabel: { ...typography.h3, color: colors.neutralDarkDarkest },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  eventsList: { gap: spacing.sm },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  dateBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeMonth: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  badgeDay: { ...typography.h3, color: colors.white, lineHeight: 20 },
  eventContent: { flex: 1 },
  eventTitle: { ...typography.h4, color: colors.neutralDarkDarkest },
  eventTitleDone: { color: colors.textMuted, textDecorationLine: "line-through" },
  eventDates: { ...typography.bodyXS, color: colors.textMuted, marginTop: 2 },
  eventDone: { ...typography.h4, color: colors.green, paddingRight: spacing.xs },
  // Divider
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xl,
  },
  // Schedule section
  scheduleSection: { paddingBottom: spacing.md },
  sectionTitle: {
    ...typography.h3,
    color: colors.neutralDarkDarkest,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  dayHeader: { flexDirection: "row", alignItems: "center", flex: 1 },
  dayLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  dayBadge: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.neutralLight, alignItems: "center", justifyContent: "center",
  },
  dayBadgeToday: { backgroundColor: colors.primary },
  dayBadgeText: { ...typography.actionM, color: colors.neutralDarkMedium },
  dayBadgeTextToday: { color: colors.white },
  dayName: { ...typography.h4, color: colors.neutralDarkDarkest },
  dayNameToday: { color: colors.primary },
  dayMeta: { ...typography.bodyXS, color: colors.textMuted, marginTop: 2 },
  entryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  entryDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  durationBadge: { backgroundColor: colors.primaryLightest, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  durationText: { ...typography.bodyXS, color: colors.primary, fontVariant: ["tabular-nums"] },
  entryName: { ...typography.bodyM, color: colors.neutralDarkDarkest, flex: 1 },
  editDayBtn: { paddingTop: spacing.sm },
  editDayText: { ...typography.actionS, color: colors.primary },
  addFirstBtn: { paddingVertical: spacing.sm },
  addFirstText: { ...typography.actionM, color: colors.primary },
});
