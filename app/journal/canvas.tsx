import { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { getFolder, JournalFolder } from "../../src/db/journal";
import { getCanvasFiles, deleteCanvasFile, CanvasFile } from "../../src/db/canvas";
import { BadgeIcon } from "../../src/components/BadgeIcon";
import { DeleteConfirmSheet, DeleteConfirmSheetRef } from "../../src/components/DeleteConfirmSheet";
import { titleCase } from "../../src/utils/text";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function CanvasScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const folderId = parseInt(id, 10);

  const [folder, setFolder] = useState<JournalFolder | null>(null);
  const [files, setFiles] = useState<CanvasFile[]>([]);
  const deleteSheetRef = useRef<DeleteConfirmSheetRef>(null);
  const pendingDeleteRef = useRef<(() => Promise<void>) | null>(null);

  const reload = useCallback(() => {
    getFolder(folderId).then(setFolder);
    getCanvasFiles(folderId).then(setFiles);
  }, [folderId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <FlatList
        data={files}
        keyExtractor={(f) => String(f.id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{titleCase(folder?.name ?? "Canvas")}</Text>
              <Pressable
                style={styles.newBtn}
                onPress={() => router.push(`/journal/new-canvas-file?folderId=${folderId}`)}
              >
                <Text style={styles.newBtnText}>+ New</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item: file, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 40).duration(200)}>
            <Pressable
              style={styles.fileRow}
              onPress={() => router.push(`/journal/canvas-editor?id=${file.id}`)}
              onLongPress={() => {
                pendingDeleteRef.current = async () => {
                  await deleteCanvasFile(file.id);
                  getCanvasFiles(folderId).then(setFiles);
                };
                deleteSheetRef.current?.present(file.title);
              }}
            >
              <View style={styles.fileBadge}>
                <BadgeIcon
                  value={file.emoji ?? "@fe/layout"}
                  size={40}
                  color={colors.neutralDarkMedium}
                />
              </View>
              <View style={styles.fileInfo}>
                <Text style={styles.fileTitle}>{titleCase(file.title)}</Text>
                <Text style={styles.fileDate}>
                  {file.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No canvases yet</Text>
            <Text style={styles.emptyHint}>Tap + New to create one</Text>
          </View>
        }
      />

      <DeleteConfirmSheet
        ref={deleteSheetRef}
        onConfirm={() => pendingDeleteRef.current?.()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: spacing.xxl },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, marginBottom: spacing.xl },
  backText: { ...typography.actionM, color: colors.primary, marginBottom: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { ...typography.h1, color: colors.neutralDarkDarkest, flex: 1 },
  newBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full },
  newBtnText: { ...typography.actionM, color: colors.white },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fileBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: { flex: 1 },
  fileTitle: { ...typography.h4, color: colors.neutralDarkDarkest },
  fileDate: { ...typography.bodyXS, color: colors.textMuted, marginTop: 2 },
  empty: { paddingTop: spacing.xxl * 2, alignItems: "center", gap: spacing.sm },
  emptyTitle: { ...typography.h3, color: colors.neutralDarkLight },
  emptyHint: { ...typography.bodyM, color: colors.textMuted },
});
