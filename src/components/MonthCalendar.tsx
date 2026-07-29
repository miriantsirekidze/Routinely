import { memo, useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { CalendarEvent } from "../db/events";
import { colors, typography, radius } from "../constants/theme";
import { localDateStr } from "../utils/date";

const DOW_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

type Props = {
  year: number;
  month: number; // 0-indexed
  events?: CalendarEvent[];
  onDayPress?: (date: string) => void;
  selectionStart?: string;
  selectionEnd?: string;
  onDaySelect?: (date: string) => void;
  minDate?: string; // dates before this are dimmed and not pressable
  maxDate?: string; // dates after this are dimmed and not pressable
};

function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = firstDay.getDay();
  const mondayOffset = startDow === 0 ? 6 : startDow - 1;

  const cells: (string | null)[] = [];
  for (let i = 0; i < mondayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function isInRange(date: string, start?: string, end?: string): boolean {
  if (!start) return false;
  const s = start <= (end ?? start) ? start : end!;
  const e = start <= (end ?? start) ? (end ?? start) : start;
  return date >= s && date <= e;
}

function MonthCalendarImpl({
  year,
  month,
  events = [],
  onDayPress,
  selectionStart,
  selectionEnd,
  onDaySelect,
  minDate,
  maxDate,
}: Props) {
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const today = localDateStr(new Date());
  const isSelectionMode = !!onDaySelect;

  // Precompute event day lookups once (per events/month) instead of scanning `events`
  // for all 42 cells on every render.
  const { endpoints, covered } = useMemo(() => {
    const endpoints = new Set<string>();
    const covered = new Set<string>();
    const visible = weeks.flat().filter(Boolean) as string[];
    if (visible.length > 0) {
      const first = visible[0];
      const last = visible[visible.length - 1];
      for (const e of events) {
        endpoints.add(e.startDate);
        endpoints.add(e.endDate);
        const start = e.startDate < first ? first : e.startDate;
        const end = e.endDate > last ? last : e.endDate;
        if (start > end) continue;
        const d = new Date(start + "T12:00:00");
        const endD = new Date(end + "T12:00:00");
        while (d <= endD) {
          covered.add(localDateStr(d));
          d.setDate(d.getDate() + 1);
        }
      }
    }
    return { endpoints, covered };
  }, [events, weeks]);

  function handlePress(date: string) {
    if (isSelectionMode) onDaySelect?.(date);
    else onDayPress?.(date);
  }

  return (
    <View style={styles.container}>
      <View style={styles.dowRow}>
        {DOW_LABELS.map((l, i) => (
          <Text key={i} style={styles.dowLabel}>
            {l}
          </Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((date, di) => {
            if (!date) return <View key={di} style={styles.cellOuter} />;

            const isPast = !!minDate && date < minDate;
            const isBeyondMax = !!maxDate && date > maxDate;
            const isDisabled = isPast || isBeyondMax;
            const isToday = date === today;

            // Selection mode (event creation)
            const isSelectionEndpoint =
              isSelectionMode &&
              (date === selectionStart || date === selectionEnd);
            const inSelectionRange =
              isSelectionMode &&
              !isSelectionEndpoint &&
              isInRange(date, selectionStart, selectionEnd);

            // View mode (showing events)
            const isEventEndpoint = !isSelectionMode && endpoints.has(date);
            const isEventMiddle =
              !isSelectionMode && !isEventEndpoint && covered.has(date);

            const isDeepGreen = isSelectionEndpoint || isEventEndpoint;

            const cellBg = isDeepGreen
              ? colors.green
              : inSelectionRange || isEventMiddle
              ? colors.greenLightest
              : "transparent";

            const textColor = isDeepGreen
              ? colors.white
              : isToday
              ? colors.green
              : colors.neutralDarkDarkest;

            return (
              <View key={di} style={styles.cellOuter}>
                {/* cellRing holds the today border — kept outside cellClip so
                    the border never shifts the inner content position */}
                <View
                  style={[
                    styles.cellRing,
                    isToday && !isDeepGreen && styles.cellRingToday,
                  ]}
                >
                  <View style={[styles.cellClip, { backgroundColor: cellBg }]}>
                    <Pressable
                      style={styles.cellPressable}
                      onPress={() => !isDisabled && handlePress(date)}
                      disabled={isDisabled}
                      android_ripple={isDisabled ? null : { color: colors.greenLight }}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          {
                            color: isDisabled
                              ? colors.neutralLightMedium
                              : textColor,
                            fontWeight: isToday || isDeepGreen ? "700" : "400",
                          },
                        ]}
                      >
                        {parseInt(date.split("-")[2])}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export const MonthCalendar = memo(MonthCalendarImpl);

const styles = StyleSheet.create({
  container: { paddingHorizontal: 4 },
  dowRow: { flexDirection: "row", marginBottom: 4 },
  dowLabel: {
    flex: 1,
    textAlign: "center",
    ...typography.actionS,
    color: colors.textMuted,
  },
  weekRow: { flexDirection: "row", marginBottom: 2 },
  cellOuter: { flex: 1, alignItems: "center", paddingVertical: 2 },
  // cellRing sits outside cellClip so its border never displaces inner content.
  // All cells always have cellRing (transparent border) so sizes stay uniform.
  cellRing: {
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  cellRingToday: {
    borderColor: colors.green,
  },
  cellClip: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  cellPressable: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNum: { ...typography.bodyS },
});
