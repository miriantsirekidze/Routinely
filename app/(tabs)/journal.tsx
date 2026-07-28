import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import Feather from "@expo/vector-icons/Feather";
import { getFolders, JournalFolder } from "../../src/db/journal";
import { BadgeIcon } from "../../src/components/BadgeIcon";
import { colors, typography, spacing, radius } from "../../src/constants/theme";
import { titleCase } from "../../src/utils/text";

function folderAccent(folder: JournalFolder): string {
  if (folder.folderType === "canvas") return colors.warningDark;
  const hasNumber = folder.variables.some((v) => v.varType === "number");
  const hasImage = folder.variables.some((v) => v.varType === "image");
  const hasVoice = folder.variables.some((v) => v.varType === "voice");
  if (hasNumber) return colors.primary;
  if (hasImage || hasVoice) return colors.successDark;
  return colors.neutralDarkMedium;
}

function folderSubtitle(folder: JournalFolder): string {
  if (folder.folderType === "canvas") return "Spatial canvas — place and connect ideas freely";
  if (folder.folderType === "notes") return "Free writing space";
  if (folder.variables.length === 0) return "No fields defined";
  return folder.variables.map((v) => v.name).join(", ");
}

export default function JournalScreen() {
  const router = useRouter();
  const [folders, setFolders] = useState<JournalFolder[]>([]);

  useFocusEffect(
    useCallback(() => {
      getFolders().then(setFolders);
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Journal</Text>
        <Pressable style={styles.newBtn} onPress={() => router.push("/journal/new-folder")}>
          <Text style={styles.newBtnText}>+ New</Text>
        </Pressable>
      </View>

      {folders.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No folders yet</Text>
          <Text style={styles.emptySubtitle}>Create a folder to start journaling</Text>
        </View>
      ) : (
        <FlatList
          data={folders}
          keyExtractor={(f) => String(f.id)}
          contentContainerStyle={styles.list}
          numColumns={2}
          columnWrapperStyle={styles.row}
          renderItem={({ item: folder, index }) => (
            <Animated.View
              entering={FadeInDown.delay(index * 60).duration(250)}
              style={styles.cardWrap}
            >
              <Pressable
                style={styles.card}
                onPress={() => router.push(
                  folder.folderType === "canvas"
                    ? `/journal/canvas?id=${folder.id}`
                    : `/journal/folder?id=${folder.id}`
                )}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.iconWrap, { backgroundColor: folderAccent(folder) + "18" }]}>
                    {folder.emoji ? (
                      <BadgeIcon value={folder.emoji} size={40} color={folderAccent(folder)} />
                    ) : (
                      <Text style={[styles.defaultIcon, { color: folderAccent(folder) }]}>📁</Text>
                    )}
                  </View>
                  <Pressable
                    style={styles.settingsBtn}
                    onPress={() => router.push(`/journal/folder-settings?id=${folder.id}`)}
                    hitSlop={8}
                  >
                    <Feather name="more-horizontal" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                <Text style={styles.folderName} numberOfLines={1}>{titleCase(folder.name)}</Text>
                <Text style={styles.folderSub} numberOfLines={3}>
                  {folder.description ?? folderSubtitle(folder)}
                </Text>
              </Pressable>
            </Animated.View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  title: { ...typography.h1, color: colors.neutralDarkDarkest },
  newBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
  },
  newBtnText: { ...typography.actionM, color: colors.white },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  row: { gap: spacing.md, marginBottom: spacing.md },
  cardWrap: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  settingsBtn: {
    padding: 4,
    marginTop: 2,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  defaultIcon: { fontSize: 26 },
  folderName: { ...typography.h4, color: colors.neutralDarkDarkest },
  folderSub: {
    ...typography.bodyXS,
    color: colors.textMuted,
    minHeight: (typography.bodyXS.lineHeight as number) * 3,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  emptyTitle: { ...typography.h3, color: colors.neutralDarkLight },
  emptySubtitle: { ...typography.bodyM, color: colors.textMuted },
});
