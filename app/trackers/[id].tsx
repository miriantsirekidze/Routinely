import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useLLM, QWEN2_5_1_5B_QUANTIZED } from "react-native-executorch";
import {
  getTrackers,
  getTrackerResets,
  resetTracker,
  deleteTracker,
  formatVerboseElapsed,
  Tracker,
  TrackerReset,
} from "../../src/db/trackers";
import { titleCase } from "../../src/utils/text";
import { BadgeIcon } from "../../src/components/BadgeIcon";
import { colors, typography, spacing, radius } from "../../src/constants/theme";
import { getMilestoneDay, buildRelapsePrompt } from "../../src/llm/config";
import { acquireLlm, releaseLlm, onLlmFree } from "../../src/llm/llmLock";
import { formatElapsedDays } from "../../src/db/trackers";

function formatResetDuration(ms: number): string {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function TrackerDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trackerId = parseInt(id, 10);

  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [resets, setResets] = useState<TrackerReset[]>([]);
  const [elapsed, setElapsed] = useState(0);
  // false → "confirm" → "note" (input + LLM message)
  const [resetState, setResetState] = useState<false | "confirm" | "note">(false);
  const [relapseNote, setRelapseNote] = useState("");
  const [relapseMsg, setRelapseMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [milestoneText, setMilestoneText] = useState<string | null>(null);
  const relapseGeneratingRef = useRef(false);
  // Set to true when the user triggers a reset — this is the only path that loads the model
  // on this screen. Milestone notes are generated in the background by MilestoneWorker.
  const [needRelapseMsg, setNeedRelapseMsg] = useState(false);
  const [hasLlmLock, setHasLlmLock] = useState(false);

  const milestoneDay = getMilestoneDay(elapsed);

  // Only load the model once we hold the shared LLM lock, so it's never loaded concurrently
  // with the background milestone worker.
  const llm = useLLM({
    model: QWEN2_5_1_5B_QUANTIZED,
    preventLoad: !hasLlmLock,
  });

  // Hold the LLM lock while a relapse message is needed; release on cancel/finish/unmount.
  useEffect(() => {
    if (!needRelapseMsg) return;
    let acquired = false;
    const take = () => {
      if (acquireLlm()) { acquired = true; setHasLlmLock(true); return true; }
      return false;
    };
    let unsub: (() => void) | undefined;
    if (!take()) unsub = onLlmFree(() => { if (take()) unsub?.(); });
    return () => {
      unsub?.();
      if (acquired) { releaseLlm(); setHasLlmLock(false); }
    };
  }, [needRelapseMsg]);

  const load = useCallback(async () => {
    const all = await getTrackers();
    const found = all.find((t) => t.id === trackerId) ?? null;
    setTracker(found);
    if (found) {
      setElapsed(found.elapsedMs);
      if (found.milestoneText) setMilestoneText(found.milestoneText);
    }
    const r = await getTrackerResets(trackerId);
    setResets(r);
  }, [trackerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!tracker) return;
    const interval = setInterval(() => setElapsed((p) => p + 60000), 60000);
    return () => clearInterval(interval);
  }, [tracker]);

  // Interrupt on unmount to prevent crash
  useEffect(() => {
    return () => { if (llm.isGenerating) llm.interrupt(); };
  }, [llm.isGenerating, llm.interrupt]);

  // Generate relapse message once model is ready (triggered by needRelapseMsg)
  useEffect(() => {
    if (
      !llm.isReady ||
      !needRelapseMsg ||
      resetState !== "note" ||
      relapseMsg ||
      relapseGeneratingRef.current ||
      !tracker
    ) return;

    relapseGeneratingRef.current = true;
    const days = formatElapsedDays(elapsed);
    llm.generate(buildRelapsePrompt(tracker.name, days) as any)
      .then((text) => { if (text) setRelapseMsg(text); })
      .catch(() => {})
      .finally(() => { relapseGeneratingRef.current = false; });
  }, [llm.isReady, needRelapseMsg, resetState, tracker]);

  const handleResetConfirm = () => {
    setResetState("note");
    setNeedRelapseMsg(true); // unlock model load; useEffect above generates once ready
  };

  const handleReset = async () => {
    await resetTracker(trackerId, relapseNote);
    setResetState(false);
    setRelapseNote("");
    setRelapseMsg("");
    setNeedRelapseMsg(false);
    relapseGeneratingRef.current = false;
    load();
  };

  const handleDelete = async () => {
    await deleteTracker(trackerId);
    router.back();
  };

  if (!tracker) return null;

  const verboseTime = formatVerboseElapsed(elapsed);
  const progress =
    tracker.targetDays != null
      ? Math.min(elapsed / (tracker.targetDays * 86400000), 1)
      : null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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

        <View style={styles.hero}>
          {tracker.emoji && (
            <View style={styles.heroBadge}>
              <BadgeIcon value={tracker.emoji} size={56} color={colors.white} />
            </View>
          )}
          <Text style={styles.heroTime}>{verboseTime}</Text>
          <Text style={styles.name}>{titleCase(tracker.name)}</Text>
          {tracker.description ? (
            <Text style={styles.description}>{tracker.description}</Text>
          ) : null}
          <Text style={styles.since}>
            Since{" "}
            {tracker.startedAt.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
        </View>

        {/* Milestone LLM card */}
        {milestoneDay !== null && (
          <View style={styles.milestoneCard}>
            <Text style={styles.milestoneLabel}>Day {milestoneDay}</Text>
            {milestoneText ? (
              <Text style={styles.milestoneText}>{milestoneText}</Text>
            ) : (
              <Text style={styles.milestoneLoading}>
                Generating your Day {milestoneDay} insight…
              </Text>
            )}
          </View>
        )}

        {progress !== null && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>
                Progress to {tracker.targetDays} days
              </Text>
              <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          </View>
        )}

        <View style={styles.resetSection}>
          {resetState === false && (
            <Pressable style={styles.resetBtn} onPress={() => setResetState("confirm")}>
              <Text style={styles.resetIcon}>↺</Text>
              <Text style={styles.resetBtnText}>Reset tracker</Text>
            </Pressable>
          )}

          {resetState === "confirm" && (
            <View style={styles.confirmResetRow}>
              <Text style={styles.confirmResetLabel}>Reset the counter?</Text>
              <View style={styles.confirmResetBtns}>
                <Pressable onPress={() => setResetState(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.confirmResetBtn} onPress={handleResetConfirm}>
                  <Text style={styles.confirmResetBtnText}>Yes</Text>
                </Pressable>
              </View>
            </View>
          )}

          {resetState === "note" && (
            <View style={styles.relapseCard}>
              <Text style={styles.relapseTitle}>Starting fresh</Text>
              <TextInput
                style={styles.relapseInput}
                placeholder="What happened? (optional)"
                placeholderTextColor={colors.textMuted}
                value={relapseNote}
                onChangeText={setRelapseNote}
                multiline
                autoFocus
              />
              {(relapseMsg || llm.isGenerating) && (
                <View style={styles.relapseMsgCard}>
                  <Text style={styles.relapseMsgText}>
                    {relapseMsg || llm.response || "…"}
                  </Text>
                </View>
              )}
              <View style={styles.relapseActions}>
                <Pressable onPress={() => { setResetState(false); setRelapseNote(""); setRelapseMsg(""); setNeedRelapseMsg(false); relapseGeneratingRef.current = false; }}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.confirmResetBtn} onPress={handleReset}>
                  <Text style={styles.confirmResetBtnText}>Reset</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {resets.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Reset history</Text>
            {resets.map((reset, index) => (
              <Animated.View
                key={reset.id}
                entering={FadeInDown.delay(index * 40).duration(250)}
                style={styles.resetRow}
              >
                <View style={styles.resetDot} />
                <View>
                  <Text style={styles.resetDuration}>
                    {formatResetDuration(reset.durationMs)}
                  </Text>
                  <Text style={styles.resetDate}>
                    Reset on{" "}
                    {reset.resetAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>
        )}
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
  hero: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    backgroundColor: colors.greenLightest,
    marginHorizontal: spacing.lg,
    borderRadius: radius.xl,
    marginBottom: spacing.xl,
  },
  heroBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  heroTime: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.greenDark,
    textAlign: "center",
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  name: { ...typography.h2, color: colors.greenDark, marginTop: spacing.sm },
  description: {
    ...typography.bodyS,
    color: colors.greenDark,
    opacity: 0.7,
    marginTop: spacing.xs,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  since: { ...typography.bodyS, color: colors.green, marginTop: spacing.xs },
  milestoneCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    backgroundColor: colors.greenLightest,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  milestoneLabel: {
    ...typography.captionM,
    color: colors.green,
    marginBottom: spacing.xs,
  },
  milestoneText: {
    ...typography.bodyM,
    color: colors.greenDark,
    lineHeight: 22,
  },
  milestoneLoading: {
    ...typography.bodyS,
    color: colors.green,
    opacity: 0.7,
  },
  progressSection: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  progressLabel: { ...typography.bodyS, color: colors.textSecondary },
  progressPct: { ...typography.h5, color: colors.green },
  progressTrack: {
    height: 8,
    backgroundColor: colors.greenLightest,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: { height: 8, backgroundColor: colors.green, borderRadius: 4 },
  resetSection: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  relapseCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  relapseTitle: { ...typography.h4, color: colors.neutralDarkDarkest },
  relapseInput: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    ...typography.bodyM,
    color: colors.neutralDarkDarkest,
    minHeight: 64,
    textAlignVertical: "top",
    includeFontPadding: false,
  },
  relapseMsgCard: {
    backgroundColor: colors.greenLightest,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  relapseMsgText: { ...typography.bodyS, color: colors.greenDark, lineHeight: 20 },
  relapseActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.md,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutralLight,
  },
  resetIcon: { fontSize: 20, color: colors.neutralDarkMedium, lineHeight: 24 },
  resetBtnText: { ...typography.actionM, color: colors.neutralDarkMedium },
  confirmResetRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  confirmResetLabel: { ...typography.bodyM, color: colors.neutralDarkDarkest },
  confirmResetBtns: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  confirmResetBtn: {
    backgroundColor: colors.neutralLight,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
  },
  confirmResetBtnText: { ...typography.actionM, color: colors.neutralDarkDarkest },
  historySection: { paddingHorizontal: spacing.lg },
  historyTitle: {
    ...typography.h4,
    color: colors.neutralDarkDarkest,
    marginBottom: spacing.md,
  },
  resetRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  resetDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.greenLight,
    marginTop: 5,
  },
  resetDuration: { ...typography.h5, color: colors.neutralDarkDarkest },
  resetDate: { ...typography.bodyXS, color: colors.textMuted, marginTop: 2 },
});
