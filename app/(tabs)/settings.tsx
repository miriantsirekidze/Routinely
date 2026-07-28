import { View, Text, StyleSheet, ScrollView, Switch, Pressable, ToastAndroid } from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettingsStore } from "../../src/stores/settingsStore";
import { scheduleDayReminder, cancelDayReminder } from "../../src/utils/notifications";
import { generateFullExportCsv, generateFullExportJson } from "../../src/db/fullExport";
import { exportDatabase, importDatabase } from "../../src/db/backup";
import {
  importSchedule,
  validateImportData,
  exportSchedule,
} from "../../src/db/scheduleImport";
import { File, Directory, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ActionButton } from "../../src/components/ActionButton";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

function SettingRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description && (
          <Text style={styles.settingDescription}>{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: colors.neutralLightDark,
          true: colors.primaryLight,
        }}
        thumbColor={value ? colors.primary : colors.neutralLighter}
      />
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function FolderPicker({
  label,
  folderName,
  onPick,
  onClear,
}: {
  label: string;
  folderName: string | null;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <Pressable style={styles.folderRow} onPress={onPick}>
      <View style={styles.folderInfo}>
        <Text style={styles.folderLabel}>{label}</Text>
        <Text style={styles.folderPath} numberOfLines={1}>
          {folderName ?? "Tap to choose"}
        </Text>
      </View>
      {folderName ? (
        <Pressable onPress={onClear} hitSlop={8}>
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      ) : (
        <Text style={styles.settingValue}>Choose</Text>
      )}
    </Pressable>
  );
}

async function writeToFolder(folderUri: string, fileName: string, content: string) {
  const cacheFile = new File(Paths.cache, fileName);
  if (cacheFile.exists) cacheFile.delete();
  cacheFile.write(content);
  const destDir = new Directory(folderUri);
  try {
    const existing = destDir.list();
    for (const item of existing) {
      if (item instanceof File && item.name === fileName) {
        item.delete();
        break;
      }
    }
  } catch (_) {}
  await cacheFile.copy(destDir);
  if (cacheFile.exists) cacheFile.delete();
}

export default function SettingsScreen() {
  const settings = useSettingsStore();
  const [confirmRestore, setConfirmRestore] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <SectionHeader title="General" />
        <View style={styles.card}>
          <SettingRow
            label="Sound"
            description="Play sounds for countdown, session events"
            value={settings.soundEnabled}
            onValueChange={settings.setSoundEnabled}
          />
          <View style={styles.divider} />
          <SettingRow
            label="Haptics"
            description="Vibration feedback on button presses and events"
            value={settings.hapticsEnabled}
            onValueChange={settings.setHapticsEnabled}
          />
        </View>

        <SectionHeader title="Notifications" />
        <View style={styles.card}>
          <SettingRow
            label="Timer Running"
            description="Show notification while a session is active"
            value={settings.notifyTimerRunning}
            onValueChange={settings.setNotifyTimerRunning}
          />
          <View style={styles.divider} />
          <SettingRow
            label="Target Exceeded"
            description="Alert when activity passes expected time"
            value={settings.notifyTargetExceeded}
            onValueChange={settings.setNotifyTargetExceeded}
          />
          <View style={styles.divider} />
          <SettingRow
            label="Day Reminder"
            description={`Remind to finish day at ${String(settings.dayReminderHour).padStart(2, "0")}:${String(settings.dayReminderMinute).padStart(2, "0")}`}
            value={settings.notifyDayReminder}
            onValueChange={(v) => {
              settings.setNotifyDayReminder(v);
              if (v) {
                scheduleDayReminder();
              } else {
                cancelDayReminder();
              }
            }}
          />
          {settings.notifyDayReminder && (
            <>
              <View style={styles.divider} />
              <View style={styles.timePickerRow}>
                <Text style={styles.settingLabel}>Reminder Time</Text>
                <View style={styles.timePicker}>
                  {[19, 20, 21, 22, 23].map((h) => (
                    <Pressable
                      key={h}
                      style={[
                        styles.timeChip,
                        settings.dayReminderHour === h &&
                          styles.timeChipActive,
                      ]}
                      onPress={() => {
                        settings.setDayReminderTime(h, 0);
                        scheduleDayReminder();
                      }}
                    >
                      <Text
                        style={[
                          styles.timeChipText,
                          settings.dayReminderHour === h &&
                            styles.timeChipTextActive,
                        ]}
                      >
                        {h}:00
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          )}
        </View>

        <SectionHeader title="Defaults" />
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Rest Duration</Text>
              <Text style={styles.settingDescription}>
                Default rest between sub-activities
              </Text>
            </View>
            <Text style={styles.settingValue}>
              {settings.defaultRestSeconds}s
            </Text>
          </View>
        </View>

        <SectionHeader title="Daily CSV" />
        <View style={styles.dataCard}>
          <FolderPicker
            label="CSV Folder"
            folderName={settings.dailyCsvFolderName}
            onPick={async () => {
              try {
                const dir = await Directory.pickDirectoryAsync();
                if (dir) {
                  const parts = decodeURIComponent(dir.uri).split("/");
                  const name = parts[parts.length - 1] || parts[parts.length - 2] || "Selected";
                  settings.setDailyCsvFolder(dir.uri, name);
                }
              } catch (_) {}
            }}
            onClear={() => settings.setDailyCsvFolder(null, null)}
          />
          <View style={styles.btnRow}>
            <Pressable style={styles.dataBtn} onPress={async () => {
              const csv = await generateFullExportCsv();
              const file = new File(Paths.cache, "routinely-all-history.csv");
              if (file.exists) file.delete();
              file.write(csv);
              const canShare = await Sharing.isAvailableAsync();
              if (canShare) await Sharing.shareAsync(file.uri, { mimeType: "text/csv" });
            }}>
              <Text style={styles.dataBtnText}>Export CSV</Text>
            </Pressable>
            <Pressable style={styles.dataBtn} onPress={async () => {
              const json = await generateFullExportJson();
              const file = new File(Paths.cache, "routinely-all-history.json");
              if (file.exists) file.delete();
              file.write(json);
              const canShare = await Sharing.isAvailableAsync();
              if (canShare) await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
            }}>
              <Text style={styles.dataBtnText}>Export JSON</Text>
            </Pressable>
          </View>
        </View>

        <SectionHeader title="Schedule" />
        <View style={styles.dataCard}>
          <FolderPicker
            label="Schedule Folder"
            folderName={settings.scheduleFolderName}
            onPick={async () => {
              try {
                const dir = await Directory.pickDirectoryAsync();
                if (dir) {
                  const parts = decodeURIComponent(dir.uri).split("/");
                  const name = parts[parts.length - 1] || parts[parts.length - 2] || "Selected";
                  settings.setScheduleFolder(dir.uri, name);
                }
              } catch (_) {}
            }}
            onClear={() => settings.setScheduleFolder(null, null)}
          />
          <View style={styles.btnRow}>
            <Pressable style={styles.dataBtn} onPress={async () => {
              try {
                const result = await File.pickFileAsync({ mimeTypes: ["application/json", "*/*"] });
                if (result.canceled || !result.result) return;
                const content = await result.result.text();
                const json = JSON.parse(content);
                const error = validateImportData(json);
                if (error) { ToastAndroid.show(error, ToastAndroid.SHORT); return; }
                await importSchedule(json);
                ToastAndroid.show("Schedule imported", ToastAndroid.SHORT);
              } catch (e: any) { ToastAndroid.show(e?.message ?? "Import failed", ToastAndroid.SHORT); }
            }}>
              <Text style={styles.dataBtnText}>Import</Text>
            </Pressable>
            <Pressable
              style={[styles.dataBtn, !settings.scheduleFolderUri && styles.dataBtnDisabled]}
              disabled={!settings.scheduleFolderUri}
              onPress={async () => {
                if (!settings.scheduleFolderUri) return;
                try {
                  const json = await exportSchedule();
                  await writeToFolder(settings.scheduleFolderUri, "routinely-schedule.json", json);
                  ToastAndroid.show("Schedule exported", ToastAndroid.SHORT);
                } catch (e: any) { ToastAndroid.show(e?.message ?? "Export failed", ToastAndroid.SHORT); }
              }}
            >
              <Text style={[styles.dataBtnText, !settings.scheduleFolderUri && styles.dataBtnTextDisabled]}>Export</Text>
            </Pressable>
            <Pressable
              style={[styles.dataBtn, !settings.scheduleFolderUri && styles.dataBtnDisabled]}
              disabled={!settings.scheduleFolderUri}
              onPress={async () => {
                if (!settings.scheduleFolderUri) return;
                try {
                  const schema = require("../../assets/schedule-schema.json");
                  await writeToFolder(settings.scheduleFolderUri, "schedule-schema.json", JSON.stringify(schema, null, 2));
                  ToastAndroid.show("Schema saved", ToastAndroid.SHORT);
                } catch (e: any) { ToastAndroid.show(e?.message ?? "Failed", ToastAndroid.SHORT); }
              }}
            >
              <Text style={[styles.dataBtnText, !settings.scheduleFolderUri && styles.dataBtnTextDisabled]}>Schema</Text>
            </Pressable>
          </View>
        </View>

        <SectionHeader title="Backup" />
        <View style={styles.dataCard}>
          <View style={styles.btnRow}>
            <Pressable style={styles.dataBtn} onPress={async () => {
              try {
                const file = exportDatabase();
                const canShare = await Sharing.isAvailableAsync();
                if (canShare) await Sharing.shareAsync(file.uri, { mimeType: "application/octet-stream" });
              } catch (e: any) { ToastAndroid.show(e?.message ?? "Backup failed", ToastAndroid.SHORT); }
            }}>
              <Text style={styles.dataBtnText}>Backup DB</Text>
            </Pressable>
            {confirmRestore ? (
              <View style={styles.restoreConfirm}>
                <Text style={styles.restoreConfirmText}>Replaces all data</Text>
                <View style={styles.restoreConfirmBtns}>
                  <Pressable onPress={() => setConfirmRestore(false)}>
                    <Text style={styles.restoreCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.restorePickBtn} onPress={async () => {
                    setConfirmRestore(false);
                    try {
                      const result = await File.pickFileAsync({ mimeTypes: ["application/octet-stream", "*/*"] });
                      if (!result.canceled && result.result) {
                        importDatabase(result.result.uri);
                        ToastAndroid.show("Restored. Please restart.", ToastAndroid.SHORT);
                      }
                    } catch (e: any) { ToastAndroid.show(e?.message ?? "Restore failed", ToastAndroid.SHORT); }
                  }}>
                    <Text style={styles.dataBtnDangerText}>Pick File</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={[styles.dataBtn, styles.dataBtnDanger]} onPress={() => setConfirmRestore(true)}>
                <Text style={styles.dataBtnDangerText}>Restore DB</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.about}>
          <Text style={styles.aboutText}>Routinely v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...typography.h1,
    color: colors.neutralDarkDarkest,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionHeader: {
    ...typography.h4,
    color: colors.neutralDarkMedium,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    gap: spacing.md,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    ...typography.bodyM,
    color: colors.neutralDarkDarkest,
    fontWeight: "600",
  },
  settingDescription: {
    ...typography.bodyS,
    color: colors.textMuted,
    marginTop: 2,
  },
  settingValue: {
    ...typography.h4,
    color: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.neutralLight,
    marginHorizontal: spacing.md,
  },
  timePickerRow: {
    padding: spacing.md,
  },
  timePicker: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.neutralLight,
  },
  timeChipActive: {
    backgroundColor: colors.primary,
  },
  timeChipText: {
    ...typography.actionM,
    color: colors.neutralDarkMedium,
  },
  timeChipTextActive: {
    color: colors.white,
  },
  clearText: {
    ...typography.actionS,
    color: colors.errorDark,
  },
  dataCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  folderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  folderInfo: {
    flex: 1,
  },
  folderLabel: {
    ...typography.h5,
    color: colors.neutralDarkMedium,
  },
  folderPath: {
    ...typography.bodyS,
    color: colors.textMuted,
    marginTop: 2,
  },
  btnRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  dataBtn: {
    flex: 1,
    backgroundColor: colors.primaryLightest,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
  },
  dataBtnDisabled: {
    backgroundColor: colors.neutralLight,
  },
  dataBtnText: {
    ...typography.actionM,
    color: colors.primary,
  },
  dataBtnTextDisabled: {
    color: colors.textMuted,
  },
  dataBtnDanger: {
    backgroundColor: colors.errorLight,
  },
  dataBtnDangerText: {
    ...typography.actionM,
    color: colors.errorDark,
  },
  restoreConfirm: {
    flex: 1,
    gap: spacing.xs,
  },
  restoreConfirmText: { ...typography.bodyXS, color: colors.textMuted },
  restoreConfirmBtns: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  restoreCancelText: { ...typography.actionS, color: colors.textMuted },
  restorePickBtn: {
    backgroundColor: colors.errorLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  about: {
    alignItems: "center",
    marginTop: spacing.xl,
  },
  aboutText: {
    ...typography.bodyS,
    color: colors.textMuted,
  },
});
