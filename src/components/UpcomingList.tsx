import { View, Text, StyleSheet } from "react-native";
import { SubActivityDef } from "../stores/timerStore";
import { formatDuration } from "../utils/time";
import { colors, typography, spacing, radius } from "../constants/theme";

type Props = {
  items: SubActivityDef[];
  currentIndex: number;
};

export function UpcomingList({ items, currentIndex }: Props) {
  const upcoming = items.slice(currentIndex + 1);
  if (upcoming.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Upcoming</Text>
      {upcoming.map((item, index) => {
        const actualIndex = currentIndex + 1 + index;
        return (
          <View key={actualIndex} style={styles.item}>
            <View style={styles.itemLeft}>
              <View style={styles.indexCircle}>
                <Text style={styles.indexText}>{actualIndex + 1}</Text>
              </View>
              <Text style={styles.itemName}>{item.name}</Text>
            </View>
            {item.expectedDuration != null && (
              <Text style={styles.itemExpected}>
                {formatDuration(item.expectedDuration)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
  },
  header: {
    ...typography.h4,
    color: colors.neutralDarkMedium,
    marginBottom: spacing.sm,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    marginBottom: 2,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  indexCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLightest,
    alignItems: "center",
    justifyContent: "center",
  },
  indexText: {
    ...typography.h5,
    color: colors.primary,
  },
  itemName: {
    ...typography.bodyM,
    color: colors.neutralDarkLight,
    flex: 1,
  },
  itemExpected: {
    ...typography.bodyS,
    color: colors.textMuted,
  },
});
