import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  RichText, useEditorBridge, useEditorContent, useBridgeState, TenTapStartKit,
} from "@10play/tentap-editor";
import { colors, typography, spacing, radius } from "../constants/theme";
import { scheduleReminder } from "../utils/notifications";

// `value: null` clears the mark (back to default text / no highlight).
type Swatch = { value: string | null; swatch: string };
const TEXT_COLORS: Swatch[] = [
  { value: null, swatch: colors.neutralDarkDarkest },
  { value: "#006FFD", swatch: "#006FFD" },
  { value: "#ED3241", swatch: "#ED3241" },
  { value: "#15803D", swatch: "#15803D" },
  { value: "#E86339", swatch: "#E86339" },
];
const HIGHLIGHTS: Swatch[] = [
  { value: null, swatch: colors.white },
  { value: "#FEF08A", swatch: "#FEF08A" },
  { value: "#BBF7D0", swatch: "#BBF7D0" },
  { value: "#BFDBFE", swatch: "#BFDBFE" },
  { value: "#FBCFE8", swatch: "#FBCFE8" },
];
const HEADINGS = [1, 2, 3] as const;

type Props = {
  initialHTML: string;
  onChange: (html: string) => void;
  keyboardVisible: boolean;
  placeholder?: string;
};

/**
 * WYSIWYG rich-text editor for journal description fields, built on TenTap (TipTap in a
 * WebView). Content is stored/emitted as an HTML string. The formatting bar is rendered as
 * the last child so it sits directly above the keyboard — the parent screen pads its bottom
 * by the keyboard height (Expo forces edge-to-edge on Android, which defeats adjustResize).
 */
export default function RichTextEditor({ initialHTML, onChange, keyboardVisible, placeholder }: Props) {
  const editor = useEditorBridge({
    bridgeExtensions: TenTapStartKit,
    initialContent: initialHTML || "",
    autofocus: false,
    avoidIosKeyboard: false,
  });
  const state = useBridgeState(editor);
  const html = useEditorContent(editor, { type: "html", debounceInterval: 400 });
  const [palette, setPalette] = useState<"color" | "highlight" | null>(null);
  const [reminderMode, setReminderMode] = useState(false);

  // Leave reminder mode whenever the keyboard closes.
  useEffect(() => {
    if (!keyboardVisible) setReminderMode(false);
  }, [keyboardVisible]);

  // Closing the reminder bar hands focus back to the editor. We keep reminderMode on until
  // the editor actually regains focus, so the toolbar container never unmounts mid-handoff
  // (which caused a one-frame flicker). A short fallback closes it if focus never lands.
  const closingRef = useRef(false);
  const closeReminder = () => {
    closingRef.current = true;
    editor.focus("end");
    setTimeout(() => {
      if (closingRef.current) { closingRef.current = false; setReminderMode(false); }
    }, 300);
  };
  useEffect(() => {
    if (closingRef.current && state.isFocused) {
      closingRef.current = false;
      setReminderMode(false);
    }
  }, [state.isFocused]);

  // Persist without letting the initial `undefined`/unchanged value clobber saved content.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastSaved = useRef(initialHTML);
  useEffect(() => {
    if (html === undefined || html === lastSaved.current) return;
    lastSaved.current = html;
    onChangeRef.current(html);
  }, [html]);

  // Once the webview editor is ready: set the placeholder and give the content horizontal
  // padding so text doesn't hug the screen edge (matches the rest of the entry screen).
  useEffect(() => {
    if (!state.isReady) return;
    if (placeholder) editor.setPlaceholder(placeholder);
    editor.injectCSS(".ProseMirror { padding-left: 20px; padding-right: 20px; }", "rt-hpad");
  }, [state.isReady]);

  // The bar stays up while the editor is focused, or while typing a reminder (which steals
  // focus from the editor but keeps the keyboard open).
  const showBar = keyboardVisible && (state.isFocused || reminderMode);
  const tint = (active: boolean) => (active ? colors.primary : colors.neutralDarkMedium);

  // Indent/outdent must handle both regular list items (sink/lift) and task items.
  const canIndent = state.canSink || state.canSinkTaskListItem;
  const canOutdent = state.canLift || state.canLiftTaskListItem;
  const indent = () => (state.canSink ? editor.sink() : editor.sinkTaskListItem());
  const outdent = () => (state.canLift ? editor.lift() : editor.liftTaskListItem());

  return (
    <View style={styles.wrap}>
      <RichText editor={editor} style={styles.editor} />

      {showBar && (
        <View style={styles.toolbarWrap}>
          {/* Toolbar stays mounted (just hidden) while the reminder bar is up, so its
              horizontal scroll position is preserved and it doesn't remount/flicker. */}
          <View style={reminderMode ? styles.hidden : undefined}>
          {palette && (
            <SwatchRow
              items={palette === "color" ? TEXT_COLORS : HIGHLIGHTS}
              activeValue={palette === "color" ? state.activeColor : state.activeHighlight}
              onSelect={(v) => {
                if (palette === "color") v ? editor.setColor(v) : editor.unsetColor();
                else v ? editor.setHighlight(v) : editor.unsetHighlight();
              }}
            />
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.toolbar}
          >
            <ToolBtn disabled={!state.canUndo} onPress={() => editor.undo()}>
              <MaterialCommunityIcons name="undo" size={21} color={tint(false)} />
            </ToolBtn>
            <ToolBtn disabled={!state.canRedo} onPress={() => editor.redo()}>
              <MaterialCommunityIcons name="redo" size={21} color={tint(false)} />
            </ToolBtn>
            <View style={styles.sep} />

            {HEADINGS.map((lvl) => (
              <ToolBtn key={lvl} active={state.headingLevel === lvl} onPress={() => editor.toggleHeading(lvl)}>
                <MaterialCommunityIcons name={`format-header-${lvl}` as any} size={21} color={tint(state.headingLevel === lvl)} />
              </ToolBtn>
            ))}
            <View style={styles.sep} />

            <ToolBtn active={state.isBoldActive} onPress={() => editor.toggleBold()}>
              <Feather name="bold" size={19} color={tint(state.isBoldActive)} />
            </ToolBtn>
            <ToolBtn active={state.isItalicActive} onPress={() => editor.toggleItalic()}>
              <Feather name="italic" size={19} color={tint(state.isItalicActive)} />
            </ToolBtn>
            <ToolBtn active={state.isStrikeActive} onPress={() => editor.toggleStrike()}>
              <MaterialCommunityIcons name="format-strikethrough-variant" size={21} color={tint(state.isStrikeActive)} />
            </ToolBtn>
            <View style={styles.sep} />

            <ToolBtn
              active={palette === "color" || !!state.activeColor}
              onPress={() => setPalette((p) => (p === "color" ? null : "color"))}
            >
              <MaterialCommunityIcons name="format-color-text" size={21} color={state.activeColor ?? tint(palette === "color")} />
            </ToolBtn>
            <ToolBtn
              active={palette === "highlight" || !!state.activeHighlight}
              onPress={() => setPalette((p) => (p === "highlight" ? null : "highlight"))}
            >
              <MaterialCommunityIcons name="format-color-highlight" size={21} color={tint(palette === "highlight" || !!state.activeHighlight)} />
            </ToolBtn>
            <View style={styles.sep} />

            <ToolBtn active={state.isBulletListActive} onPress={() => editor.toggleBulletList()}>
              <Feather name="list" size={19} color={tint(state.isBulletListActive)} />
            </ToolBtn>
            <ToolBtn active={state.isOrderedListActive} onPress={() => editor.toggleOrderedList()}>
              <MaterialCommunityIcons name="format-list-numbered" size={21} color={tint(state.isOrderedListActive)} />
            </ToolBtn>
            <ToolBtn active={state.isTaskListActive} onPress={() => editor.toggleTaskList()}>
              <MaterialCommunityIcons name="checkbox-marked-outline" size={20} color={tint(state.isTaskListActive)} />
            </ToolBtn>
            <ToolBtn disabled={!canOutdent} onPress={outdent}>
              <MaterialCommunityIcons name="format-indent-decrease" size={21} color={tint(false)} />
            </ToolBtn>
            <ToolBtn disabled={!canIndent} onPress={indent}>
              <MaterialCommunityIcons name="format-indent-increase" size={21} color={tint(false)} />
            </ToolBtn>
            <View style={styles.sep} />

            <ToolBtn active={state.isBlockquoteActive} onPress={() => editor.toggleBlockquote()}>
              <MaterialCommunityIcons name="format-quote-close" size={21} color={tint(state.isBlockquoteActive)} />
            </ToolBtn>
            <View style={styles.sep} />

            <ToolBtn onPress={() => setReminderMode(true)}>
              <Feather name="bell" size={19} color={tint(false)} />
            </ToolBtn>
          </ScrollView>
          </View>

          {reminderMode && <ReminderBar onClose={closeReminder} />}
        </View>
      )}
    </View>
  );
}

function ToolBtn({
  children, active = false, disabled = false, onPress,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, active && styles.btnActive, disabled && styles.btnDisabled]}
    >
      {children}
    </Pressable>
  );
}

function SwatchRow({
  items, activeValue, onSelect,
}: {
  items: Swatch[];
  activeValue: string | undefined;
  onSelect: (value: string | null) => void;
}) {
  return (
    <View style={styles.colorRow}>
      {items.map((c) => {
        const active = c.value === null ? !activeValue : activeValue?.toLowerCase() === c.value.toLowerCase();
        return (
          <Pressable key={c.value ?? "none"} onPress={() => onSelect(c.value)} style={styles.swatchBtn}>
            <View style={[styles.swatch, { backgroundColor: c.swatch }, active && styles.swatchActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

// Parse "H:MM, message" / "MM, message" / "H:MM message" into an offset + message.
// The part before the first comma (or first space) is the time; the rest is the message.
function parseReminder(input: string): { ms: number; message: string } | null {
  const trimmed = input.trim();
  const sepIdx = trimmed.includes(",") ? trimmed.indexOf(",") : trimmed.search(/\s/);
  if (sepIdx <= 0) return null;

  const timePart = trimmed.slice(0, sepIdx).trim();
  const message = trimmed.slice(sepIdx + 1).trim();
  if (!message) return null;

  let h = 0;
  let m = 0;
  if (timePart.includes(":")) {
    const [hh, mm] = timePart.split(":");
    h = parseInt(hh, 10) || 0;
    m = parseInt(mm, 10) || 0;
  } else {
    m = parseInt(timePart, 10);
    if (Number.isNaN(m)) return null;
  }
  const ms = (h * 60 + m) * 60_000;
  if (ms <= 0) return null;
  return { ms, message };
}

const formatFire = (d: Date) =>
  d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

/** One-line reminder input shown in place of the toolbar. Type e.g. "1:15, Grab bread". */
function ReminderBar({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    const parsed = parseReminder(text);
    if (!parsed) {
      setHint('Format: "1:15, message"');
      return;
    }
    const when = new Date(Date.now() + parsed.ms);
    const id = await scheduleReminder(parsed.message, when);
    if (!id) {
      setHint("Enable notifications in system settings.");
      return;
    }
    setDone(formatFire(when));
    setTimeout(onClose, 1400);
  };

  if (done) {
    return (
      <View style={styles.reminderRow}>
        <Feather name="check-circle" size={18} color={colors.successDark} />
        <Text style={styles.reminderDone}>Reminder set · {done}</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.reminderRow}>
        <Feather name="bell" size={18} color={colors.primary} />
        <TextInput
          style={styles.reminderInput}
          value={text}
          onChangeText={(t) => { setText(t); if (hint) setHint(null); }}
          placeholder="1:15, Grab bread and eggs"
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={submit}
          blurOnSubmit={false}
        />
        <Pressable onPress={onClose} hitSlop={8} style={styles.reminderIconBtn}>
          <Feather name="x" size={20} color={colors.textMuted} />
        </Pressable>
        <Pressable onPress={submit} hitSlop={8} style={styles.reminderIconBtn}>
          <Feather name="arrow-up-circle" size={22} color={text.trim() ? colors.primary : colors.neutralLightDark} />
        </Pressable>
      </View>
      {!!hint && <Text style={styles.reminderHint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  hidden: { display: "none" },
  editor: { flex: 1, backgroundColor: colors.background },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reminderInput: {
    flex: 1,
    ...typography.bodyM,
    color: colors.neutralDarkDarkest,
    padding: 0,
    includeFontPadding: false,
  },
  reminderIconBtn: { padding: 2 },
  reminderDone: { ...typography.bodyM, color: colors.neutralDarkMedium },
  reminderHint: {
    ...typography.bodyS,
    color: colors.errorDark,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  toolbarWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  btn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  btnActive: { backgroundColor: colors.primaryLightest },
  btnDisabled: { opacity: 0.35 },
  sep: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  swatchBtn: { padding: 2 },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
  },
  swatchActive: { borderColor: colors.neutralDarkDarkest },
});
