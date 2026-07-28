import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useEffect } from "react";
import { formatElapsed, formatElapsedShort } from "../utils/time";
import { colors, typography, spacing, radius } from "../constants/theme";

type Props = {
  elapsedMs: number;
  expectedMs?: number;
  label: string;
  isRunning: boolean;
};

export function TimerDisplay({ elapsedMs, expectedMs, label, isRunning }: Props) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (isRunning) {
      pulse.value = withRepeat(
        withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulse.value = withTiming(1, { duration: 300 });
    }
  }, [isRunning]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  const isOver = expectedMs ? elapsedMs > expectedMs : false;
  const formatted = formatElapsed(elapsedMs);
  const mainPart = formatted.slice(0, -3);
  const centiseconds = formatted.slice(-3);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Animated.View
          style={[
            styles.dot,
            isRunning && styles.dotActive,
            dotStyle,
          ]}
        />
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>

      <View style={styles.timerCard}>
        <View style={styles.timeRow}>
          <Text style={[styles.time, isOver && styles.timeOver]}>
            {mainPart}
          </Text>
          <Text style={[styles.centis, isOver && styles.timeOver]}>
            {centiseconds}
          </Text>
        </View>
        {expectedMs != null && (
          <View style={styles.expectedRow}>
            <View style={[styles.expectedBar, isOver && styles.expectedBarOver]}>
              <View
                style={[
                  styles.expectedFill,
                  isOver && styles.expectedFillOver,
                  { width: `${Math.min((elapsedMs / expectedMs) * 100, 100)}%` },
                ]}
              />
            </View>
            <Text style={[styles.expected, isOver && styles.expectedOver]}>
              {formatElapsedShort(expectedMs)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xl,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    justifyContent: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.neutralLightDark,
  },
  dotActive: {
    backgroundColor: colors.successMedium,
  },
  label: {
    ...typography.h4,
    color: colors.neutralDarkMedium,
  },
  timerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  time: {
    fontSize: 48,
    fontWeight: "800",
    color: colors.neutralDarkDarkest,
    fontVariant: ["tabular-nums"],
    letterSpacing: -1,
  },
  centis: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.neutralDarkLight,
    fontVariant: ["tabular-nums"],
  },
  timeOver: {
    color: colors.warningDark,
  },
  expectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    width: "100%",
  },
  expectedBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.neutralLight,
    borderRadius: 3,
    overflow: "hidden",
  },
  expectedBarOver: {
    backgroundColor: colors.warningLight,
  },
  expectedFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  expectedFillOver: {
    backgroundColor: colors.warningDark,
  },
  expected: {
    ...typography.actionM,
    color: colors.textMuted,
  },
  expectedOver: {
    color: colors.warningDark,
  },
});
