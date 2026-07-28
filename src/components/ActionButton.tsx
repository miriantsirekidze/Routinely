import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors, typography, spacing, radius } from "../constants/theme";
import { lightHaptic } from "../utils/feedback";

type Variant = "primary" | "secondary" | "danger" | "success" | "outline";
type Size = "large" | "medium" | "small";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  style?: ViewStyle;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const variantStyles: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.primary, text: colors.white },
  secondary: { bg: colors.primaryLightest, text: colors.primary },
  danger: { bg: colors.errorLight, text: colors.errorDark },
  success: { bg: colors.successDark, text: colors.white },
  outline: { bg: "transparent", text: colors.primary, border: colors.primary },
};

const sizeStyles: Record<Size, { paddingV: number; paddingH: number; minH: number }> = {
  large: { paddingV: 16, paddingH: 32, minH: 52 },
  medium: { paddingV: 12, paddingH: 24, minH: 44 },
  small: { paddingV: 8, paddingH: 16, minH: 36 },
};

export function ActionButton({
  label,
  onPress,
  variant = "primary",
  size = "large",
  disabled = false,
  style,
}: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const vs = variantStyles[variant];
  const ss = sizeStyles[size];

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        lightHaptic();
        scale.value = withSpring(0.97);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      disabled={disabled}
      style={[
        styles.button,
        {
          backgroundColor: vs.bg,
          paddingVertical: ss.paddingV,
          paddingHorizontal: ss.paddingH,
          minHeight: ss.minH,
          borderWidth: vs.border ? 1.5 : 0,
          borderColor: vs.border ?? "transparent",
        },
        disabled && styles.disabled,
        animatedStyle,
        style,
      ]}
    >
      <Text
        style={[
          size === "small" ? styles.labelSmall : styles.label,
          { color: vs.text },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.actionL,
  },
  labelSmall: {
    ...typography.actionM,
  },
  disabled: {
    opacity: 0.4,
  },
});
