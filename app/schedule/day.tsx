import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ToastAndroid,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  getScheduleForDay,
  addToSchedule,
  removeFromSchedule,
  reorderScheduleEntries,
  getDayName,
  ScheduleEntry,
} from "../../src/db/schedule";
import { getAllTemplates, TemplateWithSubs } from "../../src/db/templates";
import { ActionButton } from "../../src/components/ActionButton";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function DayScheduleScreen() {
  const router = useRouter();
  const { day } = useLocalSearchParams<{ day: string }>();
  const dayNum = Number(day);
  const dayName = getDayName(dayNum);

  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [templates, setTemplates] = useState<TemplateWithSubs[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    const [e, t] = await Promise.all([
      getScheduleForDay(dayNum),
      getAllTemplates(),
    ]);
    setEntries(e);
    setTemplates(t);
  }, [dayNum]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const assignedIds = new Set(entries.map((e) => e.templateId));
  const available = templates.filter((t) => !assignedIds.has(t.id));

  const handleAdd = async (templateId: number) => {
    await addToSchedule(dayNum, templateId);
    setShowPicker(false);
    load();
  };

  const handleMove = async (from: number, to: number) => {
    if (to < 0 || to >= entries.length) return;
    const newEntries = [...entries];
    const [item] = newEntries.splice(from, 1);
    newEntries.splice(to, 0, item);
    setEntries(newEntries);
    await reorderScheduleEntries(
      dayNum,
      newEntries.map((e) => e.id)
    );
  };

  const handleRemove = async (entry: ScheduleEntry) => {
    await removeFromSchedule(entry.id);
    load();
    ToastAndroid.show(`"${entry.templateName}" removed`, ToastAndroid.SHORT);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>{dayName}</Text>
        <Text style={styles.subtitle}>
          {entries.length} session{entries.length !== 1 ? "s" : ""} planned
        </Text>

        {entries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Assigned</Text>
            {entries.map((entry, index) => (
              <Animated.View
                key={entry.id}
                entering={FadeInDown.delay(index * 50).duration(250)}
              >
                <Pressable
                  style={styles.entryCard}
                  onLongPress={() => handleRemove(entry)}
                >
                  <View style={styles.entryLeft}>
                    <View style={styles.orderBadge}>
                      <Text style={styles.orderText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.entryName}>
                      {entry.templateName}
                    </Text>
                  </View>
                  <View style={styles.entryActions}>
                    <Pressable
                      onPress={() => handleMove(index, index - 1)}
                      hitSlop={6}
                      disabled={index === 0}
                    >
                      <Text style={[styles.moveBtn, index === 0 && styles.moveBtnDisabled]}>↑</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleMove(index, index + 1)}
                      hitSlop={6}
                      disabled={index === entries.length - 1}
                    >
                      <Text style={[styles.moveBtn, index === entries.length - 1 && styles.moveBtnDisabled]}>↓</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleRemove(entry)}
                      hitSlop={6}
                    >
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        )}

        {!showPicker && available.length > 0 && (
          <View style={styles.addSection}>
            <ActionButton
              label="Add Template"
              onPress={() => setShowPicker(true)}
              variant="outline"
              size="medium"
              style={{ width: "100%" }}
            />
          </View>
        )}

        {showPicker && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Available Templates</Text>
            {available.length === 0 ? (
              <Text style={styles.noTemplates}>
                No templates available. Create one first.
              </Text>
            ) : (
              available.map((t, index) => (
                <Animated.View
                  key={t.id}
                  entering={FadeInDown.delay(index * 50).duration(250)}
                >
                  <Pressable
                    style={styles.templateCard}
                    onPress={() => handleAdd(t.id)}
                  >
                    <View style={styles.templateIcon}>
                      <Text style={styles.templateIconText}>
                        {t.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.templateContent}>
                      <Text style={styles.templateName}>{t.name}</Text>
                      <Text style={styles.templateMeta}>
                        {t.subActivities.length} activities
                      </Text>
                    </View>
                    <View style={styles.addBadge}>
                      <Text style={styles.addBadgeText}>+</Text>
                    </View>
                  </Pressable>
                </Animated.View>
              ))
            )}
            <Pressable
              onPress={() => setShowPicker(false)}
              style={styles.cancelPicker}
            >
              <Text style={styles.cancelPickerText}>Cancel</Text>
            </Pressable>
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
  section: {
    marginTop: spacing.xl,
  },
  sectionLabel: {
    ...typography.h4,
    color: colors.neutralDarkMedium,
    marginBottom: spacing.md,
  },
  entryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  entryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  orderBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.neutralLight,
    alignItems: "center",
    justifyContent: "center",
  },
  orderText: {
    ...typography.h5,
    color: colors.neutralDarkDarkest,
  },
  entryName: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
    flex: 1,
  },
  entryActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  moveBtn: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: "600",
    paddingHorizontal: 2,
  },
  moveBtnDisabled: {
    color: colors.neutralLightDark,
  },
  removeText: {
    ...typography.actionS,
    color: colors.errorDark,
  },
  addSection: {
    marginTop: spacing.xl,
  },
  templateCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  templateIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLightest,
    alignItems: "center",
    justifyContent: "center",
  },
  templateIconText: {
    ...typography.h3,
    color: colors.primary,
  },
  templateContent: {
    flex: 1,
  },
  templateName: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
  },
  templateMeta: {
    ...typography.bodyXS,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLightest,
    alignItems: "center",
    justifyContent: "center",
  },
  addBadgeText: {
    ...typography.h4,
    color: colors.primary,
  },
  noTemplates: {
    ...typography.bodyM,
    color: colors.textMuted,
  },
  cancelPicker: {
    alignItems: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  cancelPickerText: {
    ...typography.actionL,
    color: colors.textSecondary,
  },
});
