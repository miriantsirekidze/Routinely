import { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, Image, Switch, Modal, Dimensions, Keyboard,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { AudioModule, useAudioRecorder, RecordingPresets, useAudioPlayer } from "expo-audio";
import Feather from "@expo/vector-icons/Feather";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import {
  getFolder, getEntry, createEntry, updateEntry, updateFieldValue,
  deleteEntry, JournalFolder, JournalVariable,
} from "../../src/db/journal";
import { localDateStr } from "../../src/utils/date";
import { colors, typography, spacing, radius } from "../../src/constants/theme";
import RichTextEditor from "../../src/components/RichTextEditor";

type FieldState = {
  textValue: string;
  numberValue: string;
  images: string[];
  voiceUri: string | null;
  checked: boolean;
};
function defaultField(): FieldState {
  return { textValue: "", numberValue: "", images: [], voiceUri: null, checked: false };
}

const SCREEN_W = Dimensions.get("window").width;

// ─── Audio Player Sheet ──────────────────────────────────────────────────────

function AudioPlayerSheet({
  uri, onDelete, onClose,
}: { uri: string; onDelete: () => void; onClose: () => void }) {
  const player = useAudioPlayer({ uri });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(true);

  const startTick = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (!mounted.current) return;
      const ct = player.currentTime ?? 0;
      const dur = player.duration ?? 0;
      setCurrentTime(ct);
      if (dur > 0) setDuration(dur);
      if (!player.playing && playing) {
        setPlaying(false);
        clearInterval(intervalRef.current!);
      }
    }, 100);
  };

  useEffect(() => {
    mounted.current = true;
    player.play();
    setPlaying(true);
    startTick();
    return () => {
      mounted.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      try { player.pause(); } catch {}
    };
  }, []);

  const togglePlay = () => {
    if (player.playing) {
      player.pause();
      setPlaying(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    } else {
      if (duration > 0 && currentTime >= duration - 0.3) {
        player.seekTo(0); setCurrentTime(0);
      }
      player.play(); setPlaying(true); startTick();
    }
  };

  const seek = (delta: number) => {
    const t = Math.max(0, Math.min(duration, currentTime + delta));
    player.seekTo(t); setCurrentTime(t);
  };

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <BottomSheetView style={playerStyles.container}>
      <Text style={playerStyles.title}>Voice Note</Text>
      <View style={playerStyles.progressTrack}>
        <View style={[playerStyles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={playerStyles.timeRow}>
        <Text style={playerStyles.time}>{fmt(currentTime)}</Text>
        <Text style={playerStyles.time}>{fmt(duration)}</Text>
      </View>
      <View style={playerStyles.controls}>
        <Pressable style={playerStyles.seekBtn} onPress={() => seek(-10)}>
          <Feather name="rotate-ccw" size={22} color={colors.neutralDarkMedium} />
          <Text style={playerStyles.seekLabel}>10</Text>
        </Pressable>
        <Pressable style={playerStyles.playBtn} onPress={togglePlay}>
          <Feather name={playing ? "pause" : "play"} size={28} color={colors.white} />
        </Pressable>
        <Pressable style={playerStyles.seekBtn} onPress={() => seek(10)}>
          <Feather name="rotate-cw" size={22} color={colors.neutralDarkMedium} />
          <Text style={playerStyles.seekLabel}>10</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => { onDelete(); onClose(); }}>
        <Text style={playerStyles.deleteText}>Delete recording</Text>
      </Pressable>
    </BottomSheetView>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function EntryEditorScreen() {
  const router = useRouter();
  const { folderId, entryId: paramEntryId } = useLocalSearchParams<{
    folderId?: string; entryId?: string;
  }>();

  const folderIdNum = folderId ? parseInt(folderId, 10) : null;
  const existingEntryId = paramEntryId ? parseInt(paramEntryId, 10) : null;

  const [folder, setFolder] = useState<JournalFolder | null>(null);
  const [dbEntryId, setDbEntryId] = useState<number | null>(existingEntryId);
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<Record<number, FieldState>>({});

  // Recording
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recordingVarId, setRecordingVarId] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audio player sheet
  const audioSheetRef = useRef<BottomSheetModal>(null);
  const [playerUri, setPlayerUri] = useState<string | null>(null);
  const [playerVarId, setPlayerVarId] = useState<number | null>(null);
  const snapPoints = ["45%"];

  // Image full-screen
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [fullScreenVarId, setFullScreenVarId] = useState<number | null>(null);

  // Title debounce
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard height. Expo forces edge-to-edge on Android, which defeats the manifest's
  // `adjustResize` (the window no longer shrinks for the keyboard). We track the IME
  // height ourselves and pad the screen by it, so the flex:1 description sits above the
  // keyboard and its internal scroll keeps the cursor visible. The reported height excludes
  // the bottom (nav-bar) inset, so we add it back to clear the keyboard's top action bar.
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    const init = async () => {
      if (existingEntryId) {
        // Edit mode
        const entry = await getEntry(existingEntryId);
        if (!entry) return;
        const f = await getFolder(entry.folderId);
        if (!f) return;
        setFolder(f);
        setTitle(entry.title);
        const init: Record<number, FieldState> = {};
        f.variables.forEach((v) => { init[v.id] = defaultField(); });
        entry.values.forEach((val) => {
          if (!init[val.variableId]) return;
          init[val.variableId] = {
            textValue: val.textValue ?? "",
            numberValue: val.numberValue !== null ? String(val.numberValue) : "",
            images: val.mediaUris ?? [],
            voiceUri: val.mediaUris?.[0] ?? null,
            checked: val.textValue === "true",
          };
        });
        setFields(init);
      } else if (folderIdNum) {
        // Create mode — create entry immediately
        const f = await getFolder(folderIdNum);
        if (!f) return;
        setFolder(f);
        const defaultTitle = new Date().toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
        });
        setTitle(defaultTitle);
        const init: Record<number, FieldState> = {};
        f.variables.forEach((v) => { init[v.id] = defaultField(); });
        setFields(init);
        const entry = await createEntry({
          folderId: folderIdNum,
          title: defaultTitle,
          entryDate: localDateStr(new Date()),
          values: f.variables.map((v) => ({
            variableId: v.id, textValue: null, numberValue: null, mediaUris: null,
          })),
        });
        setDbEntryId(entry.id);
      }
    };
    init();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    };
  }, []);

  // Persist title with 400ms debounce
  const handleTitleChange = (t: string) => {
    setTitle(t);
    if (!dbEntryId) return;
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(() => {
      updateEntry(dbEntryId, { title: t.trim() || (folder?.name ?? "") });
    }, 400);
  };

  // Persist a field immediately
  const saveField = (varId: number, state: FieldState, variable: JournalVariable) => {
    if (!dbEntryId) return;
    const isDesc = variable.varType === "text" || variable.varType === "description";
    updateFieldValue(dbEntryId, varId, {
      textValue: isDesc ? (state.textValue || null)
        : variable.varType === "checkbox" ? String(state.checked) : null,
      numberValue: variable.varType === "number" ? (parseFloat(state.numberValue) || null) : null,
      mediaUris: variable.varType === "image" ? (state.images.length > 0 ? state.images : null)
        : variable.varType === "voice" ? (state.voiceUri ? [state.voiceUri] : null) : null,
    });
  };

  const update = (varId: number, patch: Partial<FieldState>) => {
    setFields((prev) => {
      const next = { ...prev, [varId]: { ...prev[varId], ...patch } };
      const variable = folder?.variables.find((v) => v.id === varId);
      if (variable) saveField(varId, next[varId], variable);
      return next;
    });
  };

  const pickImage = async (varId: number, camera: boolean) => {
    const fn = camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await fn({ quality: 0.8 });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      const v = folder!.variables.find((v) => v.id === varId)!;
      update(varId, { images: v.allowMultiple ? [...(fields[varId]?.images ?? []), ...uris] : [uris[0]] });
    }
  };

  const deleteImage = (varId: number, uri: string) => {
    update(varId, { images: fields[varId].images.filter((u) => u !== uri) });
    setFullScreenImage(null);
    setFullScreenVarId(null);
  };

  const startRecording = async (varId: number) => {
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    if (!granted) return;
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecordingVarId(varId);
    setIsRecording(true);
    setElapsedSecs(0);
    timerRef.current = setInterval(() => setElapsedSecs((s) => s + 1), 1000);
  };

  const stopRecording = async (varId: number) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    await recorder.stop();
    const uri = recorder.uri;
    if (uri) update(varId, { voiceUri: uri });
    setRecordingVarId(null);
    setIsRecording(false);
    setElapsedSecs(0);
  };

  const openPlayer = (uri: string, varId: number) => {
    setPlayerUri(uri);
    setPlayerVarId(varId);
    audioSheetRef.current?.present();
  };

  const fmtSecs = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (!folder) return null;

  // Description is rendered last, as a dedicated full-height field that fills the
  // remaining space below the other fields and scrolls internally. Everything else
  // is a compact field rendered above it.
  const descVar = folder.variables.find((v) => v.varType === "description") ?? null;
  const otherVars = folder.variables.filter((v) => v.varType !== "description");

  const fieldCtx = {
    update, pickImage,
    openFullImage: (uri: string, varId: number) => { setFullScreenImage(uri); setFullScreenVarId(varId); },
    startRecording, stopRecording, openPlayer,
    isRecording, recordingVarId, elapsedSecs, fmtSecs,
  };

  return (
    <SafeAreaView
      style={[styles.container, { paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : 0 }]}
      edges={["top"]}
    >
      {/* Minimal header: just back */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
      </View>

      <View style={styles.divider} />

      {/* Title */}
      <TextInput
        style={styles.entryTitle}
        value={title}
        onChangeText={handleTitleChange}
        placeholder="Title"
        placeholderTextColor={colors.neutralLightDark}
      />

      <View style={styles.divider} />

      {/* Non-description fields. When a description follows, this region only takes
          the space it needs (and can shrink/scroll); otherwise it fills the screen. */}
      {otherVars.length > 0 && (
        <ScrollView
          style={descVar ? fieldStyles.otherFields : { flex: 1 }}
          contentContainerStyle={fieldStyles.otherFieldsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {otherVars.map((variable, idx) => (
            <View key={variable.id}>
              {renderField(variable, fields[variable.id] ?? defaultField(), {
                ...fieldCtx,
                openFullImage: (uri: string) => fieldCtx.openFullImage(uri, variable.id),
              })}
              {idx < otherVars.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Description — rich-text editor that fills the remaining height. Its toolbar sits
          above the keyboard (the SafeAreaView is padded by the keyboard height, since Expo's
          edge-to-edge Android defeats the manifest's adjustResize). */}
      {descVar && (
        <>
          {otherVars.length > 0 && <View style={styles.divider} />}
          <RichTextEditor
            key={dbEntryId ?? "new"}
            initialHTML={fields[descVar.id]?.textValue ?? ""}
            onChange={(html) => update(descVar.id, { textValue: html })}
            keyboardVisible={keyboardHeight > 0}
            placeholder={descVar.name === "Content" ? "Write something…" : `${descVar.name}…`}
          />
        </>
      )}

      {/* Image full-screen */}
      <Modal visible={!!fullScreenImage} transparent animationType="fade">
        <Pressable style={styles.imgModal} onPress={() => { setFullScreenImage(null); setFullScreenVarId(null); }}>
          {fullScreenImage && (
            <>
              <Image source={{ uri: fullScreenImage }} style={styles.imgFull} resizeMode="cover" />
              <Pressable
                style={styles.imgDeleteBtn}
                onPress={() => fullScreenVarId !== null && deleteImage(fullScreenVarId, fullScreenImage)}
              >
                <Feather name="trash-2" size={18} color={colors.white} />
                <Text style={styles.imgDeleteText}>Delete</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Modal>

      {/* Audio player */}
      <BottomSheetModal
        ref={audioSheetRef}
        snapPoints={snapPoints}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetIndicator}
      >
        {playerUri && playerVarId !== null && (
          <AudioPlayerSheet
            uri={playerUri}
            onDelete={() => update(playerVarId, { voiceUri: null })}
            onClose={() => audioSheetRef.current?.dismiss()}
          />
        )}
      </BottomSheetModal>
    </SafeAreaView>
  );
}

function renderField(variable: JournalVariable, state: FieldState, ctx: any) {
  const {
    update, pickImage, openFullImage,
    startRecording, stopRecording, openPlayer,
    isRecording, recordingVarId, elapsedSecs, fmtSecs,
  } = ctx;
  const isThisRecording = recordingVarId === variable.id && isRecording;

  switch (variable.varType) {
    case "number":
      return (
        <View style={fieldStyles.row}>
          <Text style={fieldStyles.rowLabel}>{variable.name}</Text>
          <Text style={fieldStyles.dash}>—</Text>
          <TextInput
            style={fieldStyles.inlineInput}
            keyboardType="decimal-pad"
            placeholder=""
            value={state.numberValue}
            onChangeText={(t) => update(variable.id, { numberValue: t })}
          />
          {variable.unit && <Text style={fieldStyles.unit}>{variable.unit}</Text>}
        </View>
      );

    case "text":
      return (
        <View style={fieldStyles.row}>
          <Text style={fieldStyles.rowLabel}>{variable.name}</Text>
          <Text style={fieldStyles.dash}>—</Text>
          <TextInput
            style={fieldStyles.inlineInput}
            placeholder=""
            value={state.textValue}
            onChangeText={(t) => update(variable.id, { textValue: t })}
          />
        </View>
      );

    case "checkbox":
      return (
        <View style={fieldStyles.rowSpaced}>
          <Text style={fieldStyles.rowLabel}>{variable.name}</Text>
          <Switch
            value={state.checked}
            onValueChange={(v) => update(variable.id, { checked: v })}
            trackColor={{ false: colors.neutralLight, true: colors.primary }}
            thumbColor={colors.white}
          />
        </View>
      );

    case "image":
      return (
        <View>
          <View style={fieldStyles.rowSpaced}>
            <Text style={fieldStyles.rowLabel}>{variable.name}</Text>
            <View style={fieldStyles.mediaActions}>
              <Pressable onPress={() => pickImage(variable.id, true)}>
                <Text style={fieldStyles.mediaAction}>Camera</Text>
              </Pressable>
              <Text style={fieldStyles.mediaSep}>·</Text>
              <Pressable onPress={() => pickImage(variable.id, false)}>
                <Text style={fieldStyles.mediaAction}>Upload</Text>
              </Pressable>
            </View>
          </View>
          {state.images.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={fieldStyles.thumbRow}>
              {state.images.map((uri: string) => (
                <Pressable key={uri} onPress={() => openFullImage(uri)}>
                  <Image source={{ uri }} style={fieldStyles.thumb} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      );

    case "voice":
      return (
        <View>
          {/* Label row always visible; controls only shown when no recording exists */}
          <View style={fieldStyles.rowSpaced}>
            <Text style={fieldStyles.rowLabel}>{variable.name}</Text>
            {!state.voiceUri && (
              isThisRecording ? (
                <View style={fieldStyles.mediaActions}>
                  <Text style={fieldStyles.elapsed}>{fmtSecs(elapsedSecs)}</Text>
                  <Pressable onPress={() => stopRecording(variable.id)}>
                    <Feather name="stop-circle" size={22} color={colors.errorDark} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => startRecording(variable.id)}>
                  <Feather name="mic" size={20} color={colors.primary} />
                </Pressable>
              )
            )}
          </View>
          {state.voiceUri && (
            <View style={fieldStyles.thumbRow}>
              <Pressable
                style={fieldStyles.audioThumb}
                onPress={() => openPlayer(state.voiceUri!, variable.id)}
              >
                <Feather name="play" size={26} color={colors.white} />
              </Pressable>
            </View>
          )}
        </View>
      );

    default:
      return null;
  }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  backText: { ...typography.actionM, color: colors.primary },
  divider: { height: 1, backgroundColor: colors.border },
  entryTitle: {
    ...typography.h2,
    color: colors.neutralDarkDarkest,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    includeFontPadding: false,
  },
  // Image full-screen
  imgModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  imgFull: { width: SCREEN_W, height: SCREEN_W },
  imgDeleteBtn: {
    marginTop: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  imgDeleteText: { ...typography.actionM, color: colors.white },
  // Bottom sheet
  sheetBg: { backgroundColor: colors.background, borderRadius: radius.xl },
  sheetIndicator: { backgroundColor: colors.neutralLight },
});

const fieldStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    gap: spacing.sm,
  },
  rowSpaced: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  rowLabel: { ...typography.bodyM, color: colors.neutralDarkMedium },
  dash: { ...typography.bodyM, color: colors.neutralLightDark },
  inlineInput: {
    ...typography.bodyM,
    color: colors.neutralDarkDarkest,
    flex: 1,
    includeFontPadding: false,
    padding: 0,
  },
  unit: { ...typography.bodyM, color: colors.textMuted },
  mediaActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mediaAction: { ...typography.actionM, color: colors.primary },
  mediaSep: { ...typography.bodyM, color: colors.textMuted },
  elapsed: { ...typography.bodyS, color: colors.errorDark, fontVariant: ["tabular-nums"] },
  thumbRow: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  thumb: { width: 80, height: 80, borderRadius: radius.sm, marginRight: spacing.sm },
  audioThumb: {
    width: 80,
    height: 80,
    borderRadius: radius.sm,
    backgroundColor: colors.neutralDarkDarkest,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  // Non-description fields sit above the description in a shrinkable region.
  otherFields: { flexGrow: 0, flexShrink: 1 },
  otherFieldsContent: { paddingBottom: spacing.sm },
});

const playerStyles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    alignItems: "center",
    gap: spacing.lg,
  },
  title: { ...typography.h3, color: colors.neutralDarkDarkest },
  progressTrack: { width: "100%", height: 4, backgroundColor: colors.neutralLight, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  time: { ...typography.bodyXS, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xl, marginTop: spacing.sm },
  seekBtn: { alignItems: "center", gap: 2 },
  seekLabel: { fontSize: 10, color: colors.neutralDarkMedium },
  playBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  deleteText: { ...typography.actionM, color: colors.errorDark },
});
