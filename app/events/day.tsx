import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { getEventsForMonth, CalendarEvent } from "../../src/db/events";
import { ActionButton } from "../../src/components/ActionButton";
import { formatLongDate, formatShortDate, parseDateBadge, localDateStr } from "../../src/utils/date";
import { titleCase } from "../../src/utils/text";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function EventDayScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!date) return;
      const d = new Date(date + "T12:00:00");
      getEventsForMonth(d.getFullYear(), d.getMonth()).then((all) => {
        setEvents(all.filter((e) => e.startDate <= date && e.endDate >= date));
      });
    }, [date])
  );

  if (!date) return null;

  const today = localDateStr(new Date());
  const isPast = date < today;
  const isToday = date === today;
  const isFuture = date > today;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>{formatLongDate(date)}</Text>
        </View>

        {events.length === 0 && (
          <Text style={styles.empty}>No events on this day</Text>
        )}

        {events.length > 0 && (
          <View style={styles.list}>
            {events.map((event) => {
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
                  {event.completed && <Text style={styles.checkmark}>✓</Text>}
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.actions}>
          {!isPast && (
            <ActionButton
              label="Add Event"
              onPress={() => router.push(`/events/new?startDate=${date}`)}
              variant="primary"
              size="medium"
              style={{ backgroundColor: colors.green, flex: 1 }}
            />
          )}
          {/* Trackers can start from any past date or today, not the future */}
          {!isFuture && (
            <ActionButton
              label="Add Tracker"
              onPress={() => router.push(`/trackers/new?startDate=${date}`)}
              variant="primary"
              size="medium"
              style={{ backgroundColor: colors.green, flex: 1 }}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, marginBottom: spacing.xl },
  backText: { ...typography.actionM, color: colors.primary, marginBottom: spacing.md },
  title: { ...typography.h2, color: colors.neutralDarkDarkest },
  empty: { ...typography.bodyM, color: colors.textMuted, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.xl },
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
  checkmark: { ...typography.h4, color: colors.green },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
