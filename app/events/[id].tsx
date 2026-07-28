import { useCallback, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useLLM, QWEN2_5_1_5B_QUANTIZED } from "react-native-executorch";
import {
  getEventWithNotes,
  updateEvent,
  deleteEvent,
  upsertDayNote,
  deleteDayNote,
  saveLLMNote,
  CalendarEventWithNotes,
} from "../../src/db/events";
import { formatShortDate, formatLongDate, localDateStr } from "../../src/utils/date";
import { titleCase } from "../../src/utils/text";
import { colors, typography, spacing, radius } from "../../src/constants/theme";
import { buildEventPrompt } from "../../src/llm/config";

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T12:00:00");
  const endDate = new Date(end + "T12:00:00");
  while (current <= endDate) {
    dates.push(localDateStr(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = parseInt(id, 10);

  const [event, setEvent] = useState<CalendarEventWithNotes | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [llmNoteText, setLlmNoteText] = useState<string | null>(null);
  const noteRefs = useRef<Record<string, string>>({});
  const generatingRef = useRef(false);

  const hasCachedNote = !!event?.llmNote;

  const llm = useLLM({
    model: QWEN2_5_1_5B_QUANTIZED,
    preventLoad: hasCachedNote,
  });

  const load = useCallback(async () => {
    const e = await getEventWithNotes(eventId);
    setEvent(e);
    if (e) {
      e.dayNotes.forEach((n) => { noteRefs.current[n.date] = n.note; });
      if (e.llmNote) setLlmNoteText(e.llmNote);
    }
  }, [eventId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Generate event tip when model is ready and no cache exists
  useEffect(() => {
    if (!llm.isReady || hasCachedNote || !event || generatingRef.current) return;

    generatingRef.current = true;
    const messages = buildEventPrompt(event.title, event.description);
    llm.generate(messages as any).then((text) => {
      if (text) {
        setLlmNoteText(text);
        saveLLMNote(eventId, text);
      }
      generatingRef.current = false;
    }).catch(() => { generatingRef.current = false; });
  }, [llm.isReady, hasCachedNote, event]);

  // Interrupt on unmount to prevent crash
  useEffect(() => {
    return () => { if (llm.isGenerating) llm.interrupt(); };
  }, [llm.isGenerating, llm.interrupt]);

  const handleToggleComplete = async () => {
    if (!event) return;
    await updateEvent(eventId, { completed: !event.completed });
    load();
  };

  const handleDelete = async () => {
    await deleteEvent(eventId);
    router.back();
  };

  const handleNoteBlur = async (date: string) => {
    const note = noteRefs.current[date] ?? "";
    await upsertDayNote(eventId, date, { note });
  };

  const handleDayComplete = async (date: string, current: boolean) => {
    await upsertDayNote(eventId, date, { completed: !current });
    load();
  };

  const handleDeleteDayNote = async (date: string) => {
    await deleteDayNote(eventId, date);
    noteRefs.current[date] = "";
    load();
  };

  const getNoteForDate = (date: string) =>
    event?.dayNotes.find((n) => n.date === date)?.note ?? "";

  const isDayCompleted = (date: string) =>
    event?.dayNotes.find((n) => n.date === date)?.completed ?? false;

  const hasDayNote = (date: string) =>
    !!event?.dayNotes.find((n) => n.date === date);

  if (!event) return null;

  const isMultiDay = event.startDate !== event.endDate;
  const dates = getDatesInRange(event.startDate, event.endDate);
  const dateRangeLabel = isMultiDay
    ? `${formatShortDate(event.startDate)} – ${formatShortDate(event.endDate)}`
    : formatLongDate(event.startDate);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          {confirmDelete ? (
            <View style={styles.confirmRow}>
              <Pressable onPress={() => setConfirmDelete(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmDeleteBtn} onPress={handleDelete}>
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirmDelete(true)}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.eventTitle}>{titleCase(event.title)}</Text>
          <Text style={styles.dateRange}>{dateRangeLabel}</Text>
          {event.description ? (
            <Text style={styles.description}>{event.description}</Text>
          ) : null}
        </View>

        {/* AI tip card */}
        {(llmNoteText || llm.isGenerating || llm.error ||
          (!hasCachedNote && (llm.downloadProgress > 0 || llm.isReady))) && (
          <View style={styles.tipCard}>
            <Text style={styles.tipLabel}>✦ AI tip</Text>
            {llmNoteText ? (
              <Text style={styles.tipText}>{llmNoteText}</Text>
            ) : llm.isGenerating ? (
              <Text style={styles.tipText}>{llm.response || "Generating…"}</Text>
            ) : llm.error ? (
              <Text style={styles.tipLoading}>
                Model is downloading in the background — come back in a moment.
              </Text>
            ) : llm.downloadProgress > 0 && llm.downloadProgress < 1 ? (
              <Text style={styles.tipLoading}>
                Downloading model… {Math.round(llm.downloadProgress * 100)}%
              </Text>
            ) : (
              <Text style={styles.tipLoading}>Loading model…</Text>
            )}
          </View>
        )}

        <Pressable
          style={[styles.completeToggle, event.completed && styles.completeToggleOn]}
          onPress={handleToggleComplete}
        >
          <Text style={[styles.completeToggleText, event.completed && styles.completeToggleTextOn]}>
            {event.completed ? "✓ Completed" : "Mark as complete"}
          </Text>
        </Pressable>

        <View style={styles.plansSection}>
          <Text style={styles.plansSectionTitle}>
            {isMultiDay ? "Day plans" : "Plan"}
          </Text>
          {dates.map((date) => {
            const dayDone = isDayCompleted(date);
            const hasNote = hasDayNote(date);
            return (
              <View key={date} style={styles.dayCard}>
                {isMultiDay && (
                  <View style={styles.dayCardHeader}>
                    <Text style={styles.dayCardDate}>{formatShortDate(date)}</Text>
                    <View style={styles.dayCardActions}>
                      {hasNote && (
                        <Pressable
                          onPress={() => handleDeleteDayNote(date)}
                          hitSlop={8}
                        >
                          <Text style={styles.clearBtn}>Clear</Text>
                        </Pressable>
                      )}
                      <Pressable
                        style={[styles.dayCheck, dayDone && styles.dayCheckOn]}
                        onPress={() => handleDayComplete(date, dayDone)}
                      >
                        <Text style={[styles.dayCheckText, dayDone && styles.dayCheckTextOn]}>
                          {dayDone ? "✓ Done" : "Done?"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
                <TextInput
                  style={styles.noteInput}
                  placeholder="Plan for this day…"
                  placeholderTextColor={colors.textMuted}
                  defaultValue={getNoteForDate(date)}
                  onChangeText={(text) => { noteRefs.current[date] = text; }}
                  onBlur={() => handleNoteBlur(date)}
                  multiline
                />
                {!isMultiDay && (
                  <View style={styles.singleDayFooter}>
                    {hasNote && (
                      <Pressable onPress={() => handleDeleteDayNote(date)}>
                        <Text style={styles.clearBtn}>Clear</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.dayCheck, dayDone && styles.dayCheckOn]}
                      onPress={() => handleDayComplete(date, dayDone)}
                    >
                      <Text style={[styles.dayCheckText, dayDone && styles.dayCheckTextOn]}>
                        {dayDone ? "✓ Done" : "Done?"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  backText: { ...typography.actionM, color: colors.primary },
  deleteText: { ...typography.actionM, color: colors.errorDark },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cancelText: { ...typography.actionM, color: colors.textMuted },
  confirmDeleteBtn: {
    backgroundColor: colors.errorLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  confirmDeleteText: { ...typography.actionM, color: colors.errorDark },
  titleSection: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  eventTitle: { ...typography.h1, color: colors.neutralDarkDarkest },
  dateRange: { ...typography.bodyM, color: colors.green, marginTop: spacing.xs, fontWeight: "600" },
  description: { ...typography.bodyM, color: colors.textSecondary, marginTop: spacing.sm },
  tipCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.greenLightest,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  tipLabel: {
    ...typography.captionM,
    color: colors.green,
    marginBottom: spacing.xs,
  },
  tipText: {
    ...typography.bodyM,
    color: colors.greenDark,
    lineHeight: 22,
  },
  tipLoading: {
    ...typography.bodyS,
    color: colors.green,
    opacity: 0.7,
  },
  completeToggle: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.greenLight,
    alignItems: "center",
    backgroundColor: colors.background,
  },
  completeToggleOn: { backgroundColor: colors.green, borderColor: colors.green },
  completeToggleText: { ...typography.actionM, color: colors.green },
  completeToggleTextOn: { color: colors.white },
  plansSection: { paddingHorizontal: spacing.lg },
  plansSectionTitle: { ...typography.h4, color: colors.neutralDarkDarkest, marginBottom: spacing.md },
  dayCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  dayCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    marginBottom: spacing.xs,
  },
  dayCardDate: { ...typography.h5, color: colors.green },
  dayCardActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  clearBtn: { ...typography.actionS, color: colors.textMuted },
  noteInput: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    ...typography.bodyM,
    color: colors.neutralDarkDarkest,
    minHeight: 64,
    textAlignVertical: "top",
  },
  singleDayFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  dayCheck: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.greenLight,
  },
  dayCheckOn: { backgroundColor: colors.green, borderColor: colors.green },
  dayCheckText: { ...typography.actionS, color: colors.green },
  dayCheckTextOn: { color: colors.white },
});
