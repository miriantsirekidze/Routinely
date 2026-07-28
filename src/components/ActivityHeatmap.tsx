import { useRef, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import Svg, { Rect, Circle } from "react-native-svg";
import { HeatmapDay } from "../db/heatmap";
import { colors, typography, spacing, radius } from "../constants/theme";
import { localDateStr } from "../utils/date";

const CELL_SIZE = 14;
const GAP = 3;
const CELL_TOTAL = CELL_SIZE + GAP;
const ROWS = 7;
const WEEKS_IN_YEAR = 53;
const PADDING_V = 2;
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

type Props = {
  data: Record<string, HeatmapDay>;
  onDayPress?: (date: string) => void;
};

function getColor(count: number, isFuture: boolean): string {
  if (isFuture) return colors.neutralLightMedium;
  if (count === 0) return colors.neutralLight;
  if (count === 1) return colors.primaryLighter;
  if (count === 2) return colors.primaryLight;
  if (count <= 4) return colors.primaryMedium;
  return colors.primary;
}

function buildYearGrid() {
  const today = new Date();
  const todayStr = localDateStr(today);

  const endDate = new Date(today.getFullYear(), 11, 31);
  const startDate = new Date(today.getFullYear(), 0, 1);

  const startDay = startDate.getDay();
  const mondayOffset = startDay === 0 ? 6 : startDay - 1;
  startDate.setDate(startDate.getDate() - mondayOffset);

  const grid: { date: string; week: number; day: number }[] = [];
  const months: { label: string; week: number }[] = [];

  let lastMonth = -1;
  const current = new Date(startDate);
  let weekIndex = 0;

  while (current <= endDate || current.getDay() !== 1) {
    const dateStr = localDateStr(current);
    const day = weekIndex % 7;
    const week = Math.floor(weekIndex / 7);

    grid.push({ date: dateStr, week, day });

    const month = current.getMonth();
    if (month !== lastMonth && current.getFullYear() === today.getFullYear()) {
      months.push({
        label: current.toLocaleDateString("en-US", { month: "short" }),
        week,
      });
      lastMonth = month;
    }

    weekIndex++;
    current.setDate(current.getDate() + 1);

    if (week >= WEEKS_IN_YEAR + 2) break;
  }

  const totalWeeks = Math.ceil(weekIndex / 7);
  const todayWeek = grid.find((c) => c.date === todayStr)?.week ?? totalWeeks - 1;

  return { grid, months, totalWeeks, todayWeek };
}

export function ActivityHeatmap({ data, onDayPress }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const { grid, months, totalWeeks, todayWeek } = buildYearGrid();

  const gridWidth = totalWeeks * CELL_TOTAL;
  const gridHeight = ROWS * CELL_TOTAL - GAP;
  const monthLabelHeight = 18;
  const todayStr = localDateStr(new Date());

  const scrollTarget = Math.max(0, (todayWeek - 10) * CELL_TOTAL);

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: scrollTarget, animated: false });
    }, 100);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.dayLabels, { marginTop: monthLabelHeight }]}>
          {DAY_LABELS.map((label, i) => (
            <Text
              key={i}
              style={[
                styles.dayLabel,
                { height: CELL_TOTAL, lineHeight: CELL_TOTAL },
              ]}
            >
              {label}
            </Text>
          ))}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CELL_TOTAL}
          decelerationRate="fast"
        >
          <View>
            <View style={[styles.monthRow, { width: gridWidth }]}>
              {months.map((m, i) => (
                <Text
                  key={i}
                  style={[
                    styles.monthLabel,
                    { left: m.week * CELL_TOTAL },
                  ]}
                >
                  {m.label}
                </Text>
              ))}
            </View>

            <Svg width={gridWidth} height={gridHeight + PADDING_V * 2}>
              {grid.map((cell) => {
                const dayData = data[cell.date];
                const count = dayData?.count ?? 0;
                const isToday = cell.date === todayStr;
                const isFuture = cell.date > todayStr;

                return (
                  <Rect
                    key={cell.date}
                    x={cell.week * CELL_TOTAL}
                    y={cell.day * CELL_TOTAL + PADDING_V}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    rx={3}
                    fill={getColor(count, isFuture)}
                    stroke={isToday ? colors.primary : "transparent"}
                    strokeWidth={isToday ? 1.5 : 0}
                    onPress={() => {
                      if (!isFuture && onDayPress) {
                        onDayPress(cell.date);
                      }
                    }}
                  />
                );
              })}
              {grid
                .filter(
                  (cell) =>
                    cell.date.endsWith("-01") &&
                    cell.date.startsWith(todayStr.slice(0, 4))
                )
                .map((cell) => (
                  <Circle
                    key={`fom-${cell.date}`}
                    cx={cell.week * CELL_TOTAL + CELL_SIZE / 2}
                    cy={cell.day * CELL_TOTAL + PADDING_V + CELL_SIZE / 2}
                    r={2}
                    fill="#4ADE80"
                    opacity={0.9}
                  />
                ))}
            </Svg>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  row: {
    flexDirection: "row",
  },
  dayLabels: {
    width: 20,
    marginRight: 4,
  },
  dayLabel: {
    ...typography.bodyXS,
    color: colors.textMuted,
    fontSize: 9,
    textAlign: "center",
  },
  monthRow: {
    height: 18,
    position: "relative",
  },
  monthLabel: {
    ...typography.bodyXS,
    color: colors.textMuted,
    fontSize: 9,
    position: "absolute",
    top: 0,
  },
});
