import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, Switch, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useLLM, QWEN2_5_1_5B_QUANTIZED } from "react-native-executorch";
import { createFolder, saveFolderDescription, VarType } from "../../src/db/journal";
import { SymbolPicker } from "../../src/components/SymbolPicker";
import { ActionButton } from "../../src/components/ActionButton";
import { colors, typography, spacing, radius } from "../../src/constants/theme";
import { buildFolderDescriptionPrompt } from "../../src/llm/config";

type FolderKind = "notes" | "custom" | "canvas";

const KIND_OPTIONS: { value: FolderKind; icon: string; label: string; desc: string }[] = [
  { value: "notes",   icon: "edit-3",     label: "Notes",   desc: "Write freely — title and text, like a notes app" },
  { value: "custom",  icon: "sliders",    label: "Custom",  desc: "Define your own fields — weight, photos, voice, and more" },
  { value: "canvas",  icon: "maximize-2", label: "Canvas",  desc: "Spatial 2D board — place cards anywhere and connect ideas" },
];

type DraftVar = {
  name: string;
  varType: VarType;
  unit: string;
  required: boolean;
  allowMultiple: boolean;
};

const VAR_TYPES: { value: VarType; label: string; icon: string }[] = [
  { value: "number",      label: "Number",      icon: "hash"         },
  { value: "text",        label: "Short text",  icon: "type"         },
  { value: "description", label: "Description", icon: "align-left"   },
  { value: "image",       label: "Photo",       icon: "image"        },
  { value: "voice",       label: "Voice",       icon: "mic"          },
  { value: "checkbox",    label: "Checkbox",    icon: "check-square" },
];

function newDraftVar(): DraftVar {
  return { name: "", varType: "text", unit: "", required: false, allowMultiple: false };
}

export default function NewFolderScreen() {
  const router = useRouter();
  const [kind, setKind] = useState<FolderKind | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [variables, setVariables] = useState<DraftVar[]>([newDraftVar()]);
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingLabel, setSavingLabel] = useState("Creating folder…");

  const [loadLLM, setLoadLLM] = useState(false);
  const llm = useLLM({ model: QWEN2_5_1_5B_QUANTIZED, preventLoad: !loadLLM });

  const updateVar = (i: number, patch: Partial<DraftVar>) =>
    setVariables((prev) => prev.map((v, idx) => idx === i ? { ...v, ...patch } : v));

  const addVar = () => setVariables((prev) => [...prev, newDraftVar()]);
  const removeVar = (i: number) => setVariables((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim()) { setNameError("Please enter a name."); return; }

    setSaving(true);

    const vars =
      kind === "notes"
        ? [{ name: "Content", varType: "description" as VarType, required: false }]
        : kind === "canvas"
        ? [] // canvas folders have no entry variables
        : variables
            .filter((v) => v.name.trim())
            .map((v) => ({
              name: v.name.trim(),
              varType: v.varType,
              unit: v.unit.trim() || undefined,
              required: v.required,
              allowMultiple: v.allowMultiple,
            }));

    const folder = await createFolder({ name: name.trim(), emoji, folderType: kind!, variables: vars });

    // Navigate back immediately — folder is already saved
    router.back();

    // Generate description in the background after navigation.
    // generate() runs natively so it continues even after this component unmounts.
    // We don't interrupt it — the result is saved to DB and appears on next focus.
    if (kind !== "canvas") {
      setLoadLLM(true);
      // Small delay so navigation completes before native model load starts
      setTimeout(async () => {
        try {
          if (!llm.isReady) {
            await new Promise<void>((resolve) => {
              const t = setInterval(() => { if (llm.isReady) { clearInterval(t); resolve(); } }, 200);
              setTimeout(() => { clearInterval(t); resolve(); }, 20000);
            });
          }
          const desc = await llm.generate(buildFolderDescriptionPrompt(name.trim(), vars) as any);
          if (desc) await saveFolderDescription(folder.id, desc);
        } catch {}
      }, 500);
    }
  };

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
          <Text style={styles.title}>New Folder</Text>
        </View>

        {/* Step 1: type selection */}
        <View style={styles.section}>
          <Text style={styles.label}>Type</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.kindRow}
            style={styles.kindScroll}
          >
            {KIND_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.kindCard, kind === opt.value && styles.kindCardSelected]}
                onPress={() => setKind(opt.value)}
              >
                <Feather
                  name={opt.icon as any}
                  size={22}
                  color={kind === opt.value ? colors.primary : colors.neutralDarkMedium}
                  style={styles.kindIcon}
                />
                <Text style={[styles.kindLabel, kind === opt.value && styles.kindLabelSelected]}>
                  {opt.label}
                </Text>
                <Text style={styles.kindDesc}>{opt.desc}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Step 2: rest of the form, only after type is chosen */}
        {kind !== null && (
          <>
            <View style={styles.section}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={[styles.input, !!nameError && styles.inputError]}
                placeholder={kind === "freeform" ? "e.g. Travel Diary, Daily Log…" : "e.g. Physique Journey, Finance…"}
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={(t) => { setName(t); if (nameError) setNameError(""); }}
                autoFocus
              />
              {!!nameError && <Text style={styles.errorText}>{nameError}</Text>}
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Icon (optional)</Text>
              <SymbolPicker selected={emoji} onSelect={setEmoji} />
            </View>

            {/* Custom fields */}
            {kind === "custom" && (
              <View style={styles.section}>
                <Text style={styles.label}>Fields</Text>
                <Text style={styles.fieldHint}>
                  Every entry will have a title and date. Add extra fields below.
                </Text>

                {variables.map((v, index) => (
                  <View key={index} style={styles.varCard}>
                    <View style={styles.varHeader}>
                      <TextInput
                        style={styles.varNameInput}
                        placeholder={`Field ${index + 1} name`}
                        placeholderTextColor={colors.textMuted}
                        value={v.name}
                        onChangeText={(t) => updateVar(index, { name: t })}
                      />
                      {variables.length > 1 && (
                        <Pressable onPress={() => removeVar(index)} hitSlop={8}>
                          <Text style={styles.removeVar}>×</Text>
                        </Pressable>
                      )}
                    </View>

                    {/* Type chips */}
                    <View style={styles.typeRow}>
                      {VAR_TYPES.map((t) => (
                        <Pressable
                          key={t.value}
                          style={[styles.typeChip, v.varType === t.value && styles.typeChipActive]}
                          onPress={() => updateVar(index, { varType: t.value })}
                        >
                          <Feather
                            name={t.icon as any}
                            size={13}
                            color={v.varType === t.value ? colors.primary : colors.textMuted}
                          />
                          <Text style={[styles.typeChipLabel, v.varType === t.value && styles.typeChipLabelActive]}>
                            {t.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Unit for number */}
                    {v.varType === "number" && (
                      <TextInput
                        style={styles.unitInput}
                        placeholder="Unit (optional) — e.g. kg, $, reps"
                        placeholderTextColor={colors.textMuted}
                        value={v.unit}
                        onChangeText={(t) => updateVar(index, { unit: t })}
                      />
                    )}

                    {/* Allow multiple for image */}
                    {v.varType === "image" && (
                      <View style={styles.toggleRow}>
                        <Text style={styles.toggleLabel}>Allow multiple photos</Text>
                        <Switch
                          value={v.allowMultiple}
                          onValueChange={(val) => updateVar(index, { allowMultiple: val })}
                          trackColor={{ false: colors.neutralLight, true: colors.primary }}
                          thumbColor={colors.white}
                        />
                      </View>
                    )}

                    {/* Required */}
                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>Required</Text>
                      <Switch
                        value={v.required}
                        onValueChange={(val) => updateVar(index, { required: val })}
                        trackColor={{ false: colors.neutralLight, true: colors.primary }}
                        thumbColor={colors.white}
                      />
                    </View>
                  </View>
                ))}

                <Pressable style={styles.addVarBtn} onPress={addVar}>
                  <Text style={styles.addVarText}>+ Add field</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.actions}>
              <ActionButton
                label={saving ? "Creating…" : "Create Folder"}
                onPress={handleSave}
                variant="primary"
                disabled={saving}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 120 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, marginBottom: spacing.xl },
  backText: { ...typography.actionM, color: colors.primary, marginBottom: spacing.md },
  title: { ...typography.h1, color: colors.neutralDarkDarkest },
  section: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  label: { ...typography.h5, color: colors.textMuted, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldHint: { ...typography.bodyXS, color: colors.textMuted, marginBottom: spacing.md },
  // Kind cards
  kindScroll: { marginHorizontal: -spacing.lg },
  kindRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  kindCard: {
    width: 148,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: "transparent",
    gap: spacing.xs,
  },
  kindCardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLightest },
  kindIcon: { marginBottom: 4 },
  kindLabel: { ...typography.h4, color: colors.neutralDarkDarkest },
  kindLabelSelected: { color: colors.primary },
  kindDesc: { ...typography.bodyXS, color: colors.textMuted, lineHeight: 16 },
  // Name input
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    ...typography.bodyL,
    color: colors.neutralDarkDarkest,
  },
  inputError: { borderWidth: 1, borderColor: colors.errorDark },
  errorText: { ...typography.bodyXS, color: colors.errorDark, marginTop: spacing.xs },
  // Variable card
  varCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  varHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  varNameInput: {
    flex: 1,
    ...typography.h4,
    color: colors.neutralDarkDarkest,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
    includeFontPadding: false,
  },
  removeVar: { fontSize: 22, color: colors.textMuted, lineHeight: 24 },
  // Type chips
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipActive: { backgroundColor: colors.primaryLightest, borderColor: colors.primary },
  typeChipLabel: { ...typography.actionS, color: colors.textMuted },
  typeChipLabelActive: { color: colors.primary },
  // Unit
  unitInput: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    ...typography.bodyS,
    color: colors.neutralDarkDarkest,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Toggles
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { ...typography.bodyS, color: colors.textSecondary },
  // Add field button
  addVarBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  addVarText: { ...typography.actionM, color: colors.primary },
  actions: { paddingHorizontal: spacing.lg },
});
