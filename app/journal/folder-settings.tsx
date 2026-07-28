import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, Switch, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import {
  getFolder, updateFolder, setFolderVariables, deleteFolder,
  JournalFolder, VarType,
} from "../../src/db/journal";
import { SymbolPicker } from "../../src/components/SymbolPicker";
import { ActionButton } from "../../src/components/ActionButton";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

type DraftVar = {
  id?: number;
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

export default function FolderSettingsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const folderId = parseInt(id, 10);

  const [folder, setFolder] = useState<JournalFolder | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [variables, setVariables] = useState<DraftVar[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getFolder(folderId).then((f) => {
      if (!f) return;
      setFolder(f);
      setName(f.name);
      setEmoji(f.emoji);
      setVariables(
        f.variables.map((v) => ({
          id: v.id,
          name: v.name,
          varType: v.varType,
          unit: v.unit ?? "",
          required: v.required,
          allowMultiple: v.allowMultiple,
        }))
      );
    });
  }, [folderId]);

  const updateVar = (i: number, patch: Partial<DraftVar>) =>
    setVariables((prev) => prev.map((v, idx) => idx === i ? { ...v, ...patch } : v));

  const addVar = () =>
    setVariables((prev) => [...prev, { name: "", varType: "text", unit: "", required: false, allowMultiple: false }]);

  const removeVar = (i: number) => setVariables((prev) => prev.filter((_, idx) => idx !== i));

  // Notes folders have one auto-created "Content" field; Canvas folders have none — neither show the field editor
  const isSimple = (folder?.variables.length === 1 && folder.variables[0].name === "Content")
    || folder?.variables.length === 0;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await updateFolder(folderId, { name: name.trim(), emoji });
    if (!isSimple) {
      await setFolderVariables(
        folderId,
        variables.filter((v) => v.name.trim()).map((v) => ({
          id: v.id,
          name: v.name.trim(),
          varType: v.varType,
          unit: v.unit.trim() || undefined,
          required: v.required,
          allowMultiple: v.allowMultiple,
        }))
      );
    }
    setSaving(false);
    router.back();
  };

  const handleDelete = async () => {
    await deleteFolder(folderId);
    // Pop back past both folder contents and journal tab
    router.dismissAll();
  };

  if (!folder) return null;

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
          <View style={styles.titleRow}>
            <Text style={styles.title}>Folder Settings</Text>
            {confirmDelete ? (
              <View style={styles.confirmRow}>
                <Pressable onPress={() => setConfirmDelete(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.deleteConfirmBtn} onPress={handleDelete}>
                  <Text style={styles.deleteConfirmBtnText}>Delete</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setConfirmDelete(true)}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Folder name"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Icon</Text>
          <SymbolPicker selected={emoji} onSelect={setEmoji} />
        </View>

        {/* Variables — only for custom folders */}
        {!isSimple && (
          <View style={styles.section}>
            <Text style={styles.label}>Fields</Text>
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
                {v.varType === "number" && (
                  <TextInput
                    style={styles.unitInput}
                    placeholder="Unit (optional) — e.g. kg, $, reps"
                    placeholderTextColor={colors.textMuted}
                    value={v.unit}
                    onChangeText={(t) => updateVar(index, { unit: t })}
                  />
                )}
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

        <View style={styles.section}>
          <ActionButton
            label={saving ? "Saving…" : "Save Changes"}
            onPress={handleSave}
            variant="primary"
            disabled={saving}
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 120 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, marginBottom: spacing.xl },
  backText: { ...typography.actionM, color: colors.primary, marginBottom: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { ...typography.h1, color: colors.neutralDarkDarkest, flex: 1 },
  deleteText: { ...typography.actionM, color: colors.errorDark },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cancelText: { ...typography.actionM, color: colors.textMuted },
  section: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  label: { ...typography.h5, color: colors.textMuted, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    ...typography.bodyL,
    color: colors.neutralDarkDarkest,
  },
  varCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, marginBottom: spacing.md },
  varHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  varNameInput: { flex: 1, ...typography.h4, color: colors.neutralDarkDarkest, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, includeFontPadding: false },
  removeVar: { fontSize: 22, color: colors.textMuted, lineHeight: 24 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  typeChipActive: { backgroundColor: colors.primaryLightest, borderColor: colors.primary },
  typeChipLabel: { ...typography.actionS, color: colors.textMuted },
  typeChipLabelActive: { color: colors.primary },
  unitInput: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 8, ...typography.bodyS, color: colors.neutralDarkDarkest, borderWidth: 1, borderColor: colors.border },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { ...typography.bodyS, color: colors.textSecondary },
  addVarBtn: { backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  addVarText: { ...typography.actionM, color: colors.primary },
  deleteConfirmBtn: { backgroundColor: colors.errorLight, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full },
  deleteConfirmBtnText: { ...typography.actionM, color: colors.errorDark },
});
