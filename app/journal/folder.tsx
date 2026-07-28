import { useCallback, useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { LineChart } from "react-native-gifted-charts";
import {
  getFolder, getEntries, getNumberHistory, deleteEntry,
  JournalFolder, JournalEntry,
} from "../../src/db/journal";
import { DeleteConfirmSheet, DeleteConfirmSheetRef } from "../../src/components/DeleteConfirmSheet";
import { localDateStr } from "../../src/utils/date";
import { titleCase } from "../../src/utils/text";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function FolderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const folderId = parseInt(id, 10);

  const [folder, setFolder] = useState<JournalFolder | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [chartData, setChartData] = useState<{ value: number; label: string }[]>([]);
  const deleteSheetRef = useRef<DeleteConfirmSheetRef>(null);
  const pendingDeleteRef = useRef<(() => Promise<void>) | null>(null);

  useFocusEffect(
    useCallback(() => {
      getFolder(folderId).then((f) => {
        setFolder(f);
        if (f?.folderType === "canvas") {
          router.replace(`/journal/canvas?id=${folderId}`);
        }
      });
      getEntries(folderId).then(setEntries);
    }, [folderId])
  );

  // Load chart for the first number variable if any
  useFocusEffect(
    useCallback(() => {
      if (!folder) return;
      const numVar = folder.variables.find((v) => v.varType === "number");
      if (!numVar) return;
      getNumberHistory(folderId, numVar.id).then((history) => {
        setChartData(
          history.map((h) => ({
            value: h.value,
            label: h.date.slice(5), // "MM-DD"
          }))
        );
      });
    }, [folder, folderId])
  );

  const getEntryPreview = (entry: JournalEntry): string => {
    if (!folder) return "";
    const parts: string[] = [];
    for (const variable of folder.variables) {
      const val = entry.values.find((v) => v.variableId === variable.id);
      if (!val) continue;
      if (variable.varType === "number" && val.numberValue !== null) {
        parts.push(`${val.numberValue}${variable.unit ? " " + variable.unit : ""}`);
      } else if (variable.varType === "text" && val.textValue) {
        parts.push(val.textValue);
      } else if (variable.varType === "image" && val.mediaUris?.length) {
        parts.push(`${val.mediaUris.length} photo${val.mediaUris.length > 1 ? "s" : ""}`);
      } else if (variable.varType === "voice" && val.mediaUris?.length) {
        parts.push("voice note");
      } else if (variable.varType === "checkbox") {
        parts.push(`${variable.name}: ${val.textValue === "true" ? "yes" : "no"}`);
      }
    }
    return parts.join(" · ");
  };

  if (!folder) return null;

  const numVar = folder.variables.find((v) => v.varType === "number");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <FlatList
        data={entries}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <Pressable onPress={() => router.back()}>
                <Text style={styles.backText}>← Back</Text>
              </Pressable>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{titleCase(folder.name)}</Text>
                <Pressable
                  style={styles.newBtn}
                  onPress={() => router.push(`/journal/new-entry?folderId=${folderId}`)}
                >
                  <Text style={styles.newBtnText}>+ New</Text>
                </Pressable>
              </View>
              <Text style={styles.fieldsList}>
                {folder.variables.map((v) => v.name).join(" · ")}
              </Text>
            </View>

            {/* Number chart */}
            {numVar && chartData.length > 1 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartLabel}>
                  {numVar.name}{numVar.unit ? ` (${numVar.unit})` : ""}
                </Text>
                <LineChart
                  data={chartData}
                  width={280}
                  height={120}
                  color={colors.primary}
                  thickness={2}
                  hideDataPoints={chartData.length > 10}
                  dataPointsColor={colors.primary}
                  startFillColor={colors.primaryLighter}
                  endFillColor="transparent"
                  areaChart
                  curved
                  yAxisTextStyle={{ color: colors.textMuted, fontSize: 9 }}
                  xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
                  noOfSections={3}
                  rulesType="dashed"
                  rulesColor={colors.border}
                />
              </View>
            )}

            {entries.length > 0 && (
              <View style={styles.entriesHeader}>
                <Text style={styles.entriesTitle}>{entries.length} entries</Text>
              </View>
            )}
          </>
        }
        renderItem={({ item: entry, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 40).duration(200)}>
              <Pressable
                style={styles.entryRow}
                onPress={() => router.push(`/journal/new-entry?entryId=${entry.id}`)}
                onLongPress={() => {
                  pendingDeleteRef.current = async () => {
                    await deleteEntry(entry.id);
                    getEntries(folderId).then(setEntries);
                  };
                  deleteSheetRef.current?.present(entry.title);
                }}
              >
                <View style={styles.entryLeft}>
                  <Text style={styles.entryTitle}>{titleCase(entry.title)}</Text>
                  <Text style={styles.entryPreview} numberOfLines={1}>
                    {getEntryPreview(entry)}
                  </Text>
                </View>
                <Text style={styles.entryDate}>
                  {entry.entryDate ?? entry.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </Pressable>
          </Animated.View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No entries yet</Text>
            <Text style={styles.emptyStateHint}>Tap + New to add one</Text>
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
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, marginBottom: spacing.md },
  backText: { ...typography.actionM, color: colors.primary, marginBottom: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  title: { ...typography.h1, color: colors.neutralDarkDarkest, flex: 1 },
  newBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full },
  newBtnText: { ...typography.actionM, color: colors.white },
  fieldsList: { ...typography.bodyXS, color: colors.textMuted, marginTop: 4 },
  chartCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  chartLabel: { ...typography.h5, color: colors.neutralDarkDarkest, marginBottom: spacing.sm },
  entriesHeader: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  entriesTitle: { ...typography.h4, color: colors.textMuted },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entryLeft: { flex: 1 },
  entryTitle: { ...typography.h4, color: colors.neutralDarkDarkest },
  entryPreview: { ...typography.bodyXS, color: colors.textMuted, marginTop: 2 },
  entryDate: { ...typography.bodyXS, color: colors.textMuted },
  emptyState: { paddingTop: spacing.xxl, alignItems: "center", gap: spacing.sm },
  emptyStateText: { ...typography.h3, color: colors.neutralDarkLight },
  emptyStateHint: { ...typography.bodyM, color: colors.textMuted },
});
