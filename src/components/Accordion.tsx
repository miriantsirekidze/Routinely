import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { selectionHaptic } from "../utils/feedback";
import { colors, typography, spacing, radius } from "../constants/theme";

type Props = {
  children: React.ReactNode;
  header: React.ReactNode;
  defaultOpen?: boolean;
};

function ChevronIcon({ color, rotated }: { color: string; rotated: boolean }) {
  const rotation = useSharedValue(rotated ? 180 : 0);

  useEffect(() => {
    rotation.value = withTiming(rotated ? 180 : 0, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });
  }, [rotated]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <Path
          d="M6 9L12 15L18 9"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  );
}

export function Accordion({ children, header, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => {
    selectionHaptic();
    setOpen((prev) => !prev);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={toggle} style={styles.header}>
        <View style={styles.headerContent}>{header}</View>
        <ChevronIcon color={colors.neutralDarkLightest} rotated={open} />
      </Pressable>
      {open && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  headerContent: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
});
