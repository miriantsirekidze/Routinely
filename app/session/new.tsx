import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ToastAndroid,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useTimerStore, SubActivityDef } from "../../src/stores/timerStore";
import { getTemplate } from "../../src/db/templates";
import { ActionButton } from "../../src/components/ActionButton";
import { TextInputField } from "../../src/components/TextInputField";
import { TagChip } from "../../src/components/TagChip";
import {
  getAllTags,
  createTag,
  Tag,
} from "../../src/db/tags";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function NewSessionScreen() {
  const router = useRouter();
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  const startSession = useTimerStore((s) => s.startSession);

  const [sessionName, setSessionName] = useState("");
  const [expectedMinutes, setExpectedMinutes] = useState("");
  const [restSeconds, setRestSeconds] = useState("30");
  const [subActivities, setSubActivities] = useState<
    { name: string; expectedText: string }[]
  >([{ name: "", expectedText: "" }]);
  const [loadedTemplateId, setLoadedTemplateId] = useState<number | undefined>();
  const [sessionTags, setSessionTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  useEffect(() => {
    getAllTags().then(setAllTags);
  }, []);

  useEffect(() => {
    if (templateId) {
      getTemplate(Number(templateId)).then((t) => {
        if (!t) return;
        setSessionName(t.name);
        setLoadedTemplateId(t.id);
        if (t.tags.length > 0) setSessionTags(t.tags);
        setExpectedMinutes(
          t.expectedDuration ? String(Math.round(t.expectedDuration / 60)) : ""
        );
        if (t.subActivities.length > 0) {
          setRestSeconds(String(t.subActivities[0].restDuration));
        }
        setSubActivities(
          t.subActivities.map((s) => ({
            name: s.name,
            expectedText: s.expectedDuration
              ? String(Math.round(s.expectedDuration / 60))
              : "",
          }))
        );
      });
    }
  }, [templateId]);

  const updateSubActivity = (
    index: number,
    field: "name" | "expectedText",
    value: string
  ) => {
    setSubActivities((prev) =>
      prev.map((sa, i) => (i === index ? { ...sa, [field]: value } : sa))
    );
  };

  const addSubActivity = () => {
    setSubActivities((prev) => [
      ...prev,
      { name: "", expectedText: "" },
    ]);
  };

  const moveSubActivity = (from: number, to: number) => {
    if (to < 0 || to >= subActivities.length) return;
    setSubActivities((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const removeSubActivity = (index: number) => {
    if (subActivities.length <= 1) return;
    setSubActivities((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStart = async () => {
    const name = sessionName.trim();
    if (!name) {
      ToastAndroid.show("Please enter a session name.", ToastAndroid.SHORT);
      return;
    }

    const validSubs = subActivities.filter((sa) => sa.name.trim() !== "");
    if (validSubs.length === 0) {
      ToastAndroid.show("Please add at least one sub-activity.", ToastAndroid.SHORT);
      return;
    }

    const expDur = expectedMinutes
      ? parseInt(expectedMinutes, 10) * 60
      : undefined;

    const sessionRest = parseInt(restSeconds, 10) || 30;
    const defs: SubActivityDef[] = validSubs.map((sa) => ({
      name: sa.name.trim(),
      expectedDuration: sa.expectedText
        ? parseInt(sa.expectedText, 10) * 60
        : undefined,
      restDuration: sessionRest,
    }));

    await startSession(name, defs, expDur, loadedTemplateId);
    router.replace("/session/active");
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        keyboardShouldPersistTaps="handled"
        extraScrollHeight={20}
      >
        <Text style={styles.title}>
          {templateId ? "Start from Template" : "New Session"}
        </Text>

        <TextInputField
          label="Session Name"
          value={sessionName}
          onChangeText={setSessionName}
          placeholder="e.g. Workout - Chest Day"
        />

        <View style={styles.sessionMetaRow}>
          <View style={{ flex: 1 }}>
            <TextInputField
              label="Expected (min)"
              value={expectedMinutes}
              onChangeText={setExpectedMinutes}
              placeholder="—"
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextInputField
              label="Rest Timer (sec)"
              value={restSeconds}
              onChangeText={setRestSeconds}
              placeholder="30"
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.tagSection}>
          <Text style={styles.sectionLabel}>Tags</Text>
          <View style={styles.tagList}>
            {sessionTags.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                selected
                onRemove={() =>
                  setSessionTags((prev) => prev.filter((t) => t.id !== tag.id))
                }
              />
            ))}
            <Pressable
              style={styles.addTagBtn}
              onPress={() => setShowTagPicker(!showTagPicker)}
            >
              <Text style={styles.addTagText}>+ Tag</Text>
            </Pressable>
          </View>
          {showTagPicker && (
            <View>
            <View style={styles.tagPickerChips}>
              {allTags
                .filter((t) => !sessionTags.some((st) => st.id === t.id))
                .map((tag) => (
                  <TagChip
                    key={tag.id}
                    tag={tag}
                    onPress={() => {
                      setSessionTags((prev) => [...prev, tag]);
                      setShowTagPicker(false);
                    }}
                  />
                ))}
            </View>
            <View style={styles.newTagRow}>
              <TextInputField
                value={newTagName}
                onChangeText={setNewTagName}
                placeholder="New tag name"
                style={{ flex: 1 }}
              />
              <Pressable
                style={styles.createTagBtn}
                onPress={async () => {
                  if (!newTagName.trim()) return;
                  const tag = await createTag(newTagName.trim());
                  setSessionTags((prev) => [...prev, tag]);
                  setAllTags((prev) =>
                    prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]
                  );
                  setNewTagName("");
                  setShowTagPicker(false);
                }}
              >
                <Text style={styles.createTagText}>Add</Text>
              </Pressable>
            </View>
            </View>
          )}
        </View>

        <View style={styles.subHeader}>
          <Text style={styles.sectionLabel}>Activities</Text>
          <Pressable onPress={addSubActivity} hitSlop={12}>
            <View style={styles.addCircle}>
              <Text style={styles.addCircleText}>+</Text>
            </View>
          </Pressable>
        </View>

        {subActivities.map((sa, index) => (
          <Animated.View
            key={index}
            entering={FadeInDown.delay(index * 50).duration(200)}
            style={styles.subCard}
          >
            <View style={styles.subRow}>
              <View style={styles.indexCircle}>
                <Text style={styles.indexText}>{index + 1}</Text>
              </View>
              <TextInputField
                value={sa.name}
                onChangeText={(text) => updateSubActivity(index, "name", text)}
                placeholder={`Activity ${index + 1}`}
                style={{ flex: 1 }}
              />
              {subActivities.length > 1 && (
                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => moveSubActivity(index, index - 1)}
                    hitSlop={6}
                    disabled={index === 0}
                  >
                    <Text style={[styles.moveBtn, index === 0 && styles.moveBtnDisabled]}>↑</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => moveSubActivity(index, index + 1)}
                    hitSlop={6}
                    disabled={index === subActivities.length - 1}
                  >
                    <Text style={[styles.moveBtn, index === subActivities.length - 1 && styles.moveBtnDisabled]}>↓</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeSubActivity(index)}
                    style={styles.removeCircle}
                    hitSlop={6}
                  >
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <View style={styles.subMetaRow}>
              <Text style={styles.subMetaLabel}>Expected</Text>
              <TextInputField
                value={sa.expectedText}
                onChangeText={(text) =>
                  updateSubActivity(index, "expectedText", text)
                }
                placeholder="—"
                keyboardType="numeric"
                style={styles.subMetaInput}
              />
              <Text style={styles.subMetaUnit}>min</Text>
            </View>
          </Animated.View>
        ))}
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        <ActionButton
          label="Cancel"
          onPress={() => router.back()}
          variant="secondary"
          style={{ flex: 1 }}
        />
        <ActionButton
          label="Start"
          onPress={handleStart}
          variant="primary"
          style={{ flex: 1 }}
        />
      </View>
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
    paddingBottom: 120,
  },
  title: {
    ...typography.h1,
    color: colors.neutralDarkDarkest,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.h4,
    color: colors.neutralDarkMedium,
  },
  subHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  addCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addCircleText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 22,
  },
  tagSection: {
    marginTop: spacing.lg,
  },
  tagList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  addTagBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.neutralLight,
  },
  addTagText: {
    ...typography.actionM,
    color: colors.neutralDarkMedium,
  },
  tagPickerChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  newTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  createTagBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  createTagText: {
    ...typography.actionM,
    color: colors.white,
  },
  subCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sessionMetaRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  subMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
    paddingLeft: 40,
  },
  subMetaLabel: {
    ...typography.bodyXS,
    color: colors.textMuted,
  },
  subMetaInput: {
    width: 52,
    height: 52,
  },
  subMetaUnit: {
    ...typography.bodyXS,
    color: colors.textMuted,
  },
  indexCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.neutralLight,
    alignItems: "center",
    justifyContent: "center",
  },
  indexText: {
    ...typography.h5,
    color: colors.neutralDarkDarkest,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  moveBtn: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: "600",
    paddingHorizontal: 4,
  },
  moveBtnDisabled: {
    color: colors.neutralLightDark,
  },
  removeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.errorLight,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: {
    color: colors.errorDark,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 20,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.neutralLight,
  },
});
