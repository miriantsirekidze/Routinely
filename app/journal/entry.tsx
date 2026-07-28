import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Image, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useAudioPlayer } from "expo-audio";
import { getEntry, getFolder, deleteEntry, JournalEntry, JournalFolder } from "../../src/db/journal";
import { formatLongDate } from "../../src/utils/date";
import { titleCase } from "../../src/utils/text";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function EntryScreen() {
  const router = useRouter();
  const { id, folderId } = useLocalSearchParams<{ id: string; folderId: string }>();
  const entryId = parseInt(id, 10);
  const folderIdNum = parseInt(folderId, 10);

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [folder, setFolder] = useState<JournalFolder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fullImage, setFullImage] = useState<string | null>(null);
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const player = useAudioPlayer(voiceUri ? { uri: voiceUri } : null);

  useFocusEffect(
    useCallback(() => {
      getEntry(entryId).then(setEntry);
      getFolder(folderIdNum).then(setFolder);
    }, [entryId, folderIdNum])
  );

  const handleDelete = async () => {
    await deleteEntry(entryId);
    router.back();
  };

  const playVoice = (uri: string) => {
    if (player.playing) {
      player.pause();
    } else {
      setVoiceUri(uri);
      player.play();
    }
  };

  if (!entry || !folder) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{titleCase(entry.title)}</Text>
            {confirmDelete ? (
              <View style={styles.confirmRow}>
                <Pressable onPress={() => setConfirmDelete(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.deleteConfirmBtn} onPress={handleDelete}>
                  <Text style={styles.deleteConfirmText}>Delete</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setConfirmDelete(true)}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            )}
          </View>
          {entry.entryDate && (
            <Text style={styles.date}>{formatLongDate(entry.entryDate)}</Text>
          )}
        </View>

        <View style={styles.fields}>
          {folder.variables.map((variable) => {
            const val = entry.values.find((v) => v.variableId === variable.id);
            if (!val) return null;

            return (
              <View key={variable.id} style={styles.fieldCard}>
                <Text style={styles.fieldLabel}>{variable.name}</Text>

                {variable.varType === "number" && val.numberValue !== null && (
                  <Text style={styles.fieldNumber}>
                    {val.numberValue}{variable.unit ? ` ${variable.unit}` : ""}
                  </Text>
                )}

                {(variable.varType === "text" || variable.varType === "description") && val.textValue && (
                  <Text style={styles.fieldText}>{val.textValue}</Text>
                )}

                {variable.varType === "checkbox" && (
                  <Text style={styles.fieldText}>{val.textValue === "true" ? "✓ Yes" : "✗ No"}</Text>
                )}

                {variable.varType === "image" && val.mediaUris && val.mediaUris.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
                    {val.mediaUris.map((uri) => (
                      <Pressable key={uri} onPress={() => setFullImage(uri)}>
                        <Image source={{ uri }} style={styles.imageThumb} />
                      </Pressable>
                    ))}
                  </ScrollView>
                )}

                {variable.varType === "voice" && val.mediaUris && val.mediaUris[0] && (
                  <Pressable
                    style={[styles.playBtn, player.playing && styles.playBtnActive]}
                    onPress={() => playVoice(val.mediaUris![0])}
                  >
                    <Text style={styles.playIcon}>{player.playing ? "⏹" : "▶"}</Text>
                    <Text style={styles.playLabel}>{player.playing ? "Stop" : "Play voice note"}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Full-screen image */}
      <Modal visible={!!fullImage} transparent animationType="fade">
        <Pressable style={styles.imageModal} onPress={() => setFullImage(null)}>
          {fullImage && (
            <Image source={{ uri: fullImage }} style={styles.imageModalImg} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, marginBottom: spacing.lg },
  backText: { ...typography.actionM, color: colors.primary, marginBottom: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  title: { ...typography.h1, color: colors.neutralDarkDarkest, flex: 1 },
  deleteText: { ...typography.actionM, color: colors.errorDark },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cancelText: { ...typography.actionM, color: colors.textMuted },
  deleteConfirmBtn: { backgroundColor: colors.errorLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full },
  deleteConfirmText: { ...typography.actionM, color: colors.errorDark },
  date: { ...typography.bodyS, color: colors.textMuted, marginTop: 4 },
  fields: { paddingHorizontal: spacing.lg, gap: spacing.md },
  fieldCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  fieldLabel: { ...typography.captionM, color: colors.textMuted },
  fieldNumber: { fontSize: 36, fontWeight: "800", color: colors.neutralDarkDarkest, lineHeight: 42 },
  fieldText: { ...typography.bodyM, color: colors.neutralDarkDarkest, lineHeight: 22 },
  imageRow: { marginTop: spacing.xs },
  imageThumb: { width: 120, height: 120, borderRadius: radius.sm, marginRight: spacing.sm },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
  playBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLightest },
  playIcon: { fontSize: 18 },
  playLabel: { ...typography.actionM, color: colors.neutralDarkDarkest },
  imageModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center" },
  imageModalImg: { width: "100%", height: "80%" },
});
