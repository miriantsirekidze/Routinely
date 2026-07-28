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
import {
  createTemplate,
  updateTemplate,
  getTemplate,
} from "../../src/db/templates";
import { ActionButton } from "../../src/components/ActionButton";
import { TextInputField } from "../../src/components/TextInputField";
import { TagChip } from "../../src/components/TagChip";
import {
  getAllTags,
  getTagsForTemplate,
  addTagToTemplate,
  removeTagFromTemplate,
  createTag,
  Tag,
} from "../../src/db/tags";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

type SubField = {
  name: string;
  expectedMinutes: string;
  restSeconds: string;
};

export default function EditTemplateScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [name, setName] = useState("");
  const [expectedMinutes, setExpectedMinutes] = useState("");
  const [restSeconds, setRestSeconds] = useState("30");
  const [subs, setSubs] = useState<SubField[]>([
    { name: "", expectedMinutes: "", restSeconds: "30" },
  ]);
  const [templateTags, setTemplateTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  useEffect(() => {
    getAllTags().then(setAllTags);
    if (id) {
      getTemplate(Number(id)).then((t) => {
        if (!t) return;
        setName(t.name);
        setExpectedMinutes(
          t.expectedDuration ? String(Math.round(t.expectedDuration / 60)) : ""
        );
        setSubs(
          t.subActivities.map((s) => ({
            name: s.name,
            expectedMinutes: s.expectedDuration
              ? String(Math.round(s.expectedDuration / 60))
              : "",
            restSeconds: String(s.restDuration),
          }))
        );
      });
      getTagsForTemplate(Number(id)).then(setTemplateTags);
    }
  }, [id]);

  const updateSub = (index: number, field: keyof SubField, value: string) => {
    setSubs((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const addSub = () => {
    setSubs((prev) => [
      ...prev,
      { name: "", expectedMinutes: "", restSeconds: "30" },
    ]);
  };

  const removeSub = (index: number) => {
    if (subs.length <= 1) return;
    setSubs((prev) => prev.filter((_, i) => i !== index));
  };

  const moveSub = (from: number, to: number) => {
    if (to < 0 || to >= subs.length) return;
    setSubs((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      ToastAndroid.show("Please enter a template name.", ToastAndroid.SHORT);
      return;
    }

    const validSubs = subs.filter((s) => s.name.trim() !== "");
    if (validSubs.length === 0) {
      ToastAndroid.show("Add at least one sub-activity.", ToastAndroid.SHORT);
      return;
    }

    const expDur = expectedMinutes
      ? parseInt(expectedMinutes, 10) * 60
      : undefined;

    const sessionRest = parseInt(restSeconds, 10) || 30;
    const subData = validSubs.map((s) => ({
      name: s.name.trim(),
      expectedDuration: s.expectedMinutes
        ? parseInt(s.expectedMinutes, 10) * 60
        : undefined,
      restDuration: sessionRest,
    }));

    let templateId: number;
    if (isEditing) {
      await updateTemplate(Number(id), trimmedName, expDur, subData);
      templateId = Number(id);
    } else {
      templateId = await createTemplate(trimmedName, expDur, subData);
    }

    for (const tag of templateTags) {
      await addTagToTemplate(templateId, tag.id);
    }

    router.back();
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
          {isEditing ? "Edit Template" : "New Template"}
        </Text>

        <TextInputField
          label="Template Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Chest Day"
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
            {templateTags.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                selected
                onRemove={() => {
                  setTemplateTags((prev) => prev.filter((t) => t.id !== tag.id));
                  if (isEditing) {
                    removeTagFromTemplate(Number(id), tag.id);
                  }
                }}
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
                .filter((t) => !templateTags.some((tt) => tt.id === t.id))
                .map((tag) => (
                  <TagChip
                    key={tag.id}
                    tag={tag}
                    onPress={() => {
                      setTemplateTags((prev) => [...prev, tag]);
                      if (isEditing) {
                        addTagToTemplate(Number(id), tag.id);
                      }
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
                  setTemplateTags((prev) => [...prev, tag]);
                  setAllTags((prev) => [...prev, tag]);
                  if (isEditing) {
                    await addTagToTemplate(Number(id), tag.id);
                  }
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
          <Pressable onPress={addSub} hitSlop={12}>
            <View style={styles.addCircle}>
              <Text style={styles.addCircleText}>+</Text>
            </View>
          </Pressable>
        </View>

        {subs.map((sub, index) => (
          <Animated.View
            key={index}
            entering={FadeInDown.delay(index * 40).duration(200)}
            style={styles.subCard}
          >
            <View style={styles.subRow}>
              <View style={styles.indexCircle}>
                <Text style={styles.indexText}>{index + 1}</Text>
              </View>
              <TextInputField
                value={sub.name}
                onChangeText={(v) => updateSub(index, "name", v)}
                placeholder="Activity name"
                style={{ flex: 1 }}
              />
              {subs.length > 1 && (
                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => moveSub(index, index - 1)}
                    hitSlop={6}
                    disabled={index === 0}
                  >
                    <Text style={[styles.moveBtn, index === 0 && styles.moveBtnDisabled]}>↑</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => moveSub(index, index + 1)}
                    hitSlop={6}
                    disabled={index === subs.length - 1}
                  >
                    <Text style={[styles.moveBtn, index === subs.length - 1 && styles.moveBtnDisabled]}>↓</Text>
                  </Pressable>
                  <Pressable onPress={() => removeSub(index)} hitSlop={6}>
                    <View style={styles.removeCircle}>
                      <Text style={styles.removeIcon}>×</Text>
                    </View>
                  </Pressable>
                </View>
              )}
            </View>
            <View style={styles.subMetaRow}>
              <Text style={styles.subMetaLabel}>Expected</Text>
              <TextInputField
                value={sub.expectedMinutes}
                onChangeText={(v) => updateSub(index, "expectedMinutes", v)}
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
          label={isEditing ? "Save" : "Create"}
          onPress={handleSave}
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
  removeIcon: {
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
