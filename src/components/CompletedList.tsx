import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { formatElapsedShort, formatTime } from "../utils/time";
import { CompletedSubActivity } from "../stores/timerStore";
import { db } from "../db/client";
import { subActivities } from "../db/schema";
import { eq } from "drizzle-orm";
import { colors, typography, spacing, radius } from "../constants/theme";

type Props = {
  items: CompletedSubActivity[];
  editable?: boolean;
};

function NoteInput({ dbId }: { dbId: number }) {
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!note.trim()) return;
    await db
      .update(subActivities)
      .set({ note: note.trim() })
      .where(eq(subActivities.id, dbId));
    setSaved(true);
  };

  if (saved) {
    return (
      <Text style={styles.savedNote}>{note}</Text>
    );
  }

  return (
    <TextInput
      style={styles.noteInput}
      value={note}
      onChangeText={setNote}
      onBlur={save}
      onSubmitEditing={save}
      placeholder="Add a note..."
      placeholderTextColor={colors.neutralLightDark}
      returnKeyType="done"
    />
  );
}

export function CompletedList({ items, editable = true }: Props) {
  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{items.length}</Text>
        </View>
        <Text style={styles.header}>Completed</Text>
      </View>
      {items.map((item, index) => {
        const isOver =
          item.expectedDuration != null &&
          item.elapsedMs > item.expectedDuration * 1000;

        return (
          <Animated.View
            key={item.dbId}
            entering={FadeInDown.delay(index * 50).duration(300)}
            style={styles.item}
          >
            <View style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <View style={styles.indexCircle}>
                  <Text style={styles.indexText}>{index + 1}</Text>
                </View>
                <View style={styles.itemContent}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemTimestamp}>
                    {item.startedAt && item.endedAt
                      ? `${formatTime(item.startedAt)} – ${formatTime(item.endedAt)}`
                      : ""}
                  </Text>
                </View>
              </View>
              <Text style={[styles.itemTime, isOver && styles.itemTimeOver]}>
                {formatElapsedShort(item.elapsedMs)}
              </Text>
            </View>
            {editable && <NoteInput dbId={item.dbId} />}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.neutralLight,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBadgeText: {
    ...typography.h5,
    color: colors.neutralDarkMedium,
  },
  header: {
    ...typography.h4,
    color: colors.neutralDarkMedium,
  },
  item: {
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    backgroundColor: colors.neutralLight,
    alignItems: "center",
    justifyContent: "center",
  },
  indexText: {
    ...typography.h5,
    color: colors.neutralDarkMedium,
  },
  itemContent: {
    flex: 1,
  },
  itemName: {
    ...typography.bodyM,
    color: colors.neutralDarkDarkest,
  },
  itemTimestamp: {
    ...typography.bodyXS,
    color: colors.textMuted,
    marginTop: 2,
  },
  itemTime: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
    fontVariant: ["tabular-nums"],
  },
  itemTimeOver: {
    color: colors.warningDark,
  },
  noteInput: {
    ...typography.bodyS,
    color: colors.neutralDarkDarkest,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutralLight,
  },
  savedNote: {
    ...typography.bodyS,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: spacing.sm,
    paddingLeft: spacing.sm,
  },
});
