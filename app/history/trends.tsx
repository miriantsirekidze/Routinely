import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { LineChart } from "react-native-gifted-charts";
import Svg, { Path } from "react-native-svg";
import {
  getUniqueSessionNames,
  getSessionTrend,
  SessionTrend,
} from "../../src/db/trends";
import { formatElapsedShort } from "../../src/utils/time";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

function TrendItem({
  trend,
  chartWidth,
}: {
  trend: SessionTrend;
  chartWidth: number;
}) {
  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState<number | null>(null);

  const isImproving =
    trend.points.length >= 2 &&
    trend.lastMs < trend.points[trend.points.length - 2].totalMs;

  const displayMs =
    selectedValue !== null ? selectedValue * 1000 : trend.lastMs;

  const chartData = trend.points.map((p) => ({
    value: Math.max(0, Math.round(p.totalMs / 1000)),
  }));

  const maxVal = Math.max(...chartData.map((d) => d.value), 1);
  const usableWidth = chartWidth - 16;
  const chartSpacing = usableWidth / Math.max(chartData.length - 1, 1);

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen(!open)} style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.cardName}>{trend.name}</Text>
          <Text style={styles.cardMeta}>
            {trend.runCount} runs · avg {formatElapsedShort(trend.averageMs)}
          </Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <View style={styles.valueRow}>
            <Text style={styles.cardValue}>
              {formatElapsedShort(displayMs)}
            </Text>
            <Text style={styles.selectedLabel}>
              {selectedValue !== null
                ? (trend.points.find(
                    (p) => Math.round(p.totalMs / 1000) === selectedValue,
                  )?.label ?? "")
                : "latest"}
            </Text>
          </View>
          <Svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
          >
            <Path
              d="M6 9L12 15L18 9"
              stroke={colors.neutralDarkLightest}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      </Pressable>

      {open && (
        <View>
          <View style={styles.chartArea}>
            <LineChart
              data={chartData}
              width={chartWidth}
              height={140}
              spacing={chartSpacing}
              initialSpacing={8}
              endSpacing={8}
              curved
              curveType={1}
              areaChart
              hideDataPoints
              color={colors.primary}
              startFillColor={colors.primaryLight}
              endFillColor={colors.primaryLightest}
              startOpacity={0.3}
              endOpacity={0.05}
              thickness={2.5}
              hideRules
              hideYAxisText
              yAxisLabelWidth={0}
              yAxisColor="transparent"
              hideAxesAndRules
              noOfSections={4}
              maxValue={Math.ceil(maxVal * 1.2)}
              mostNegativeValue={0}
              disableScroll
              pointerConfig={{
                pointerStripHeight: 140,
                pointerStripColor: colors.neutralLightDark,
                pointerStripWidth: 1,
                pointerColor: colors.primary,
                radius: 5,
                activatePointersOnLongPress: false,
                persistPointer: true,
                resetPointerOnDataChange: false,
                pointerLabelWidth: 0,
                pointerLabelHeight: 0,
                initialPointerIndex: chartData.length - 1,
                pointerLabelComponent: (items: any) => {
                  const val = items?.[0]?.value ?? null;
                  if (val !== null && val !== selectedValue) {
                    setTimeout(() => setSelectedValue(val), 0);
                  }
                  return null;
                },
                onPointerLeave: () => {
                  setTimeout(() => setSelectedValue(null), 0);
                },
              }}
            />
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Shortest</Text>
              <Text style={[styles.statValue, { color: colors.successDark }]}>
                {formatElapsedShort(trend.bestMs)}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Average</Text>
              <Text style={styles.statValue}>
                {formatElapsedShort(trend.averageMs)}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Longest</Text>
              <Text style={[styles.statValue, { color: colors.warningDark }]}>
                {formatElapsedShort(trend.worstMs)}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

export default function TrendsScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [trends, setTrends] = useState<SessionTrend[]>([]);

  const accordionContentWidth = screenWidth - spacing.lg * 2 - spacing.md * 2;
  const chartWidth = accordionContentWidth;

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const names = await getUniqueSessionNames();
        const results: SessionTrend[] = [];
        for (const name of names) {
          const trend = await getSessionTrend(name);
          if (trend && trend.runCount >= 2) {
            results.push(trend);
          }
        }
        setTrends(results);
      })();
    }, []),
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>Trends</Text>
        <Text style={styles.subtitle}>Session performance over time</Text>

        {trends.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>~</Text>
            </View>
            <Text style={styles.emptyText}>Not enough data yet</Text>
            <Text style={styles.emptySubtext}>
              Complete the same session at least twice to see trends
            </Text>
          </View>
        ) : (
          <View style={styles.trendsList}>
            {trends.map((trend, index) => (
              <Animated.View
                key={trend.name}
                entering={FadeInDown.delay(index * 80).duration(300)}
              >
                <TrendItem trend={trend} chartWidth={chartWidth} />
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
  trendsList: {
    marginTop: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardHeaderLeft: {
    flex: 1,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  valueRow: {
    alignItems: "flex-end",
  },
  selectedLabel: {
    ...typography.bodyXS,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardName: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
  },
  cardMeta: {
    ...typography.bodyS,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardMetaRight: {
    ...typography.bodyXS,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardValue: {
    ...typography.h2,
    color: colors.neutralDarkDarkest,
    fontVariant: ["tabular-nums"],
  },
  chartArea: {
    marginTop: spacing.md,
    alignSelf: "center",
    marginLeft: 5
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.neutralLight,
  },
  stat: {
    alignItems: "center",
  },
  statLabel: {
    ...typography.bodyXS,
    color: colors.textMuted,
  },
  statValue: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  empty: {
    paddingTop: 100,
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
    fontSize: 24,
    fontWeight: "700",
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
    textAlign: "center",
  },
});
