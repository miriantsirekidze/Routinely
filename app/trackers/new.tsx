import { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { createTracker } from "../../src/db/trackers";
import { ActionButton } from "../../src/components/ActionButton";
import { SymbolPicker } from "../../src/components/SymbolPicker";
import { MonthCalendar } from "../../src/components/MonthCalendar";
import { useLocalSearchParams } from "expo-router";
import { localDateStr, formatLongDate } from "../../src/utils/date";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

const today = localDateStr(new Date());

export default function NewTrackerScreen() {
  const router = useRouter();
  const { startDate: paramDate } = useLocalSearchParams<{ startDate?: string }>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [targetDays, setTargetDays] = useState("");
  const [startDate, setStartDate] = useState(paramDate ?? today);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [nameError, setNameError] = useState("");
  const [targetError, setTargetError] = useState("");

  const handleSave = async () => {
    let valid = true;

    if (!name.trim()) {
      setNameError("Please enter a name.");
      valid = false;
    } else {
      setNameError("");
    }

    const target = targetDays ? parseInt(targetDays, 10) : null;
    if (targetDays && (isNaN(target!) || target! < 1)) {
      setTargetError("Enter a positive number of days.");
      valid = false;
    } else {
      setTargetError("");
    }

    if (!valid) return;

    // Use noon on the selected date so timezone offsets don't shift the day
    const startedAt = startDate === today
      ? new Date()
      : new Date(startDate + "T12:00:00");

    await createTracker({
      name: name.trim(),
      emoji,
      description: description.trim() || null,
      startedAt,
      targetDays: target,
    });
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>New Tracker</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={[styles.input, !!nameError && styles.inputError]}
              placeholder="e.g. No YouTube, No social media…"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={(t) => { setName(t); if (nameError) setNameError(""); }}
              autoFocus
            />
            {!!nameError && <Text style={styles.errorText}>{nameError}</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="e.g. Quitting smoking to improve lung health and save money…"
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Text style={styles.hint}>Helps the AI generate relevant milestone notes</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Started</Text>
            <Pressable
              style={styles.dateBtn}
              onPress={() => setShowPicker(!showPicker)}
            >
              <Text style={styles.dateBtnText}>
                {startDate === today ? "Today" : formatLongDate(startDate)}
              </Text>
              <Text style={styles.dateBtnChevron}>{showPicker ? "▲" : "▼"}</Text>
            </Pressable>
            <Text style={styles.hint}>Set to a past date if you already started</Text>

            {showPicker && (
              <View style={styles.calendarCard}>
                <View style={styles.monthNav}>
                  <Pressable
                    style={styles.navBtn}
                    onPress={() => setPickerMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                  >
                    <Text style={styles.navText}>{"‹"}</Text>
                  </Pressable>
                  <Text style={styles.monthLabel}>
                    {pickerMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </Text>
                  <Pressable
                    style={styles.navBtn}
                    onPress={() => setPickerMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                  >
                    <Text style={styles.navText}>{"›"}</Text>
                  </Pressable>
                </View>
                {/* maxDate = today so future dates are disabled */}
                <MonthCalendar
                  year={pickerMonth.getFullYear()}
                  month={pickerMonth.getMonth()}
                  selectionStart={startDate}
                  selectionEnd={startDate}
                  onDaySelect={(date) => {
                    setStartDate(date);
                    setShowPicker(false);
                  }}
                  maxDate={today}
                />
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Symbol</Text>
            <SymbolPicker selected={emoji} onSelect={setEmoji} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Target (optional)</Text>
            <View style={styles.targetRow}>
              <TextInput
                style={[styles.input, styles.targetInput, !!targetError && styles.inputError]}
                placeholder="e.g. 30"
                placeholderTextColor={colors.textMuted}
                value={targetDays}
                onChangeText={(t) => { setTargetDays(t); if (targetError) setTargetError(""); }}
                keyboardType="number-pad"
              />
              <Text style={styles.targetUnit}>days</Text>
            </View>
            {!!targetError
              ? <Text style={styles.errorText}>{targetError}</Text>
              : <Text style={styles.hint}>Leave empty for an open-ended tracker</Text>
            }
          </View>
        </View>

        <View style={styles.actions}>
          <ActionButton
            label="Start Tracker"
            onPress={handleSave}
            variant="primary"
            style={{ backgroundColor: colors.green }}
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, marginBottom: spacing.xl },
  backText: { ...typography.actionM, color: colors.primary, marginBottom: spacing.md },
  title: { ...typography.h1, color: colors.neutralDarkDarkest },
  form: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  field: {},
  label: {
    ...typography.h5,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    ...typography.bodyL,
    color: colors.neutralDarkDarkest,
  },
  multiline: { minHeight: 80, paddingTop: 14 },
  inputError: { borderWidth: 1, borderColor: colors.errorDark },
  errorText: { ...typography.bodyXS, color: colors.errorDark, marginTop: spacing.xs },
  dateBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateBtnText: { ...typography.bodyL, color: colors.neutralDarkDarkest },
  dateBtnChevron: { color: colors.textMuted, fontSize: 12 },
  calendarCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  navBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 20, color: colors.neutralDarkMedium },
  monthLabel: { ...typography.h4, color: colors.neutralDarkDarkest },
  targetRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  targetInput: { flex: 1 },
  targetUnit: { ...typography.bodyM, color: colors.textMuted },
  hint: { ...typography.bodyXS, color: colors.textMuted, marginTop: spacing.xs },
  actions: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
});
