import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect, useRef } from "react";
import { useTimerStore } from "../stores/timerStore";
import { Pressable } from "react-native";
import { lightHaptic, mediumHaptic } from "../utils/feedback";
import { useSound } from "../hooks/useSound";
import { colors, typography, spacing, radius } from "../constants/theme";

type Props = {
  remainingMs: number;
};

export function RestCountdown({ remainingMs }: Props) {
  const store = useTimerStore();
  const scale = useSharedValue(1);
  const seconds = Math.ceil(remainingMs / 1000);
  const prevSeconds = useRef(seconds);
  const hasSeenPositive = useRef(false);
  const nextName =
    store.subActivityDefs[store.currentSubActivityIndex + 1]?.name ?? "";

  const tickSound = useSound("tick");
  const countdownEndSound = useSound("countdownEnd");

  useEffect(() => {
    if (seconds > 0) {
      hasSeenPositive.current = true;
    }
  }, [seconds]);

  useEffect(() => {
    if (seconds !== prevSeconds.current && seconds > 0) {
      if (seconds <= 5) {
        tickSound.play();
        lightHaptic();
        scale.value = withSequence(
          withTiming(1.15, { duration: 150 }),
          withTiming(1, { duration: 150 })
        );
      }
      prevSeconds.current = seconds;
    }
  }, [seconds]);

  useEffect(() => {
    if (
      remainingMs <= 0 &&
      store.status === "rest" &&
      hasSeenPositive.current
    ) {
      countdownEndSound.play();
      mediumHaptic();
      store.startNextSubActivity();
    }
  }, [remainingMs]);

  const countStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>NEXT UP</Text>
        <Text style={styles.nextName}>{nextName}</Text>
        <View style={styles.countdownCircle}>
          <Animated.Text style={[styles.countdown, countStyle]}>
            {seconds}
          </Animated.Text>
        </View>
        <Text style={styles.sublabel}>seconds</Text>
        <Pressable
          style={styles.skipBtn}
          onPress={() => {
            mediumHaptic();
            store.startNextSubActivity();
          }}
        >
          <Text style={styles.skipText}>Start Now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xl,
  },
  card: {
    backgroundColor: colors.primaryLightest,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  label: {
    ...typography.captionM,
    color: colors.primaryMedium,
  },
  nextName: {
    ...typography.h2,
    color: colors.neutralDarkDarkest,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  countdownCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  countdown: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.white,
  },
  sublabel: {
    ...typography.bodyS,
    color: colors.primaryMedium,
    marginTop: spacing.sm,
  },
  skipBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
  },
  skipText: {
    ...typography.actionL,
    color: colors.white,
  },
});
