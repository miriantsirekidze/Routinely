import { useState } from "react";
import { View, Text, TextInput, StyleSheet, TextInputProps } from "react-native";
import { colors, typography, spacing, radius } from "../constants/theme";
type Props = TextInputProps & {
  label?: string;
};

export function TextInputField({ label, style, ...props }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        {...props}
        style={[
          styles.input,
          focused && styles.inputFocused,
        ]}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        placeholderTextColor={props.placeholderTextColor ?? colors.neutralLightDark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  label: {
    ...typography.h4,
    color: colors.neutralDarkMedium,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    minHeight: 48,
    ...typography.bodyL,
    color: colors.neutralDarkDarkest,
    borderWidth: 1.5,
    borderColor: colors.neutralLight,
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
});
