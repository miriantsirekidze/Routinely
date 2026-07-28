import { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { createCanvasFile } from "../../src/db/canvas";
import { SymbolPicker } from "../../src/components/SymbolPicker";
import { ActionButton } from "../../src/components/ActionButton";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function NewCanvasFileScreen() {
  const router = useRouter();
  const { folderId } = useLocalSearchParams<{ folderId: string }>();
  const folderIdNum = parseInt(folderId, 10);

  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [titleError, setTitleError] = useState("");

  const handleCreate = async () => {
    if (!title.trim()) { setTitleError("Please enter a title."); return; }
    await createCanvasFile({ folderId: folderIdNum, title: title.trim(), emoji });
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>New Canvas</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={[styles.input, !!titleError && styles.inputError]}
              placeholder="Name this canvas…"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={(t) => { setTitle(t); if (titleError) setTitleError(""); }}
              autoFocus
            />
            {!!titleError && <Text style={styles.errorText}>{titleError}</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Icon (optional)</Text>
            <SymbolPicker selected={emoji} onSelect={setEmoji} />
          </View>
        </View>

        <View style={styles.actions}>
          <ActionButton label="Create Canvas" onPress={handleCreate} variant="primary" />
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
  label: { ...typography.h5, color: colors.textMuted, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
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
  actions: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
});
