import { Pressable, Text, StyleSheet } from "react-native";
import { Tag } from "../db/tags";
import { colors, typography, radius } from "../constants/theme";

type Props = {
  tag: Tag;
  onPress?: () => void;
  onRemove?: () => void;
  selected?: boolean;
  small?: boolean;
};

export function TagChip({ tag, onPress, onRemove, selected, small }: Props) {
  const bgColor = selected ? colors.primary : colors.primaryLightest;
  const textColor = selected ? colors.white : colors.primary;
  const label = tag.name.charAt(0).toUpperCase() + tag.name.slice(1);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        small && styles.chipSmall,
        { backgroundColor: bgColor },
      ]}
    >
      <Text style={[styles.text, small && styles.textSmall, { color: textColor }]}>
        {label}
      </Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={6}>
          <Text style={[styles.remove, { color: textColor }]}>×</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  chipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    ...typography.actionM,
  },
  textSmall: {
    ...typography.actionS,
  },
  remove: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 18,
  },
});
