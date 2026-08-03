import { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import Feather from "@expo/vector-icons/Feather";
import DatePicker from "react-native-date-picker";
import { createEvent } from "../../src/db/events";
import { MonthCalendar } from "../../src/components/MonthCalendar";
import MapPickerModal, { PickedPlace } from "../../src/components/MapPickerModal";
import { ActionButton } from "../../src/components/ActionButton";
import { RouteResult, TravelMode } from "../../src/utils/routing";
import { localDateStr, formatShortDate, format12h } from "../../src/utils/date";
import { colors, typography, spacing, radius } from "../../src/constants/theme";

export default function NewEventScreen() {
  const router = useRouter();
  const { startDate: paramStart } = useLocalSearchParams<{ startDate?: string }>();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState("");
  const [dateError, setDateError] = useState("");
  const [selStart, setSelStart] = useState(paramStart ?? "");
  const [selEnd, setSelEnd] = useState(paramStart ?? "");
  const [location, setLocation] = useState<PickedPlace | null>(null);
  const [route, setRoute] = useState<{
    from: PickedPlace; to: PickedPlace; mode: TravelMode; info: RouteResult | null;
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [time, setTime] = useState<Date | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);

  const timeStr = time
    ? `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`
    : null;
  const today = localDateStr(new Date());
  const [calMonth, setCalMonth] = useState(() => {
    if (paramStart) return new Date(paramStart + "T12:00:00");
    return new Date();
  });

  const handleDaySelect = (date: string) => {
    if (!selStart || (selStart && selEnd && selStart !== selEnd)) {
      // Start fresh selection
      setSelStart(date);
      setSelEnd(date);
    } else if (date === selStart) {
      // Clear
      setSelStart("");
      setSelEnd("");
    } else if (date < selStart) {
      // New earlier start
      setSelStart(date);
    } else {
      // Set end
      setSelEnd(date);
    }
  };

  const handleSave = async () => {
    let valid = true;
    if (!title.trim()) { setTitleError("Please enter a title."); valid = false; }
    else setTitleError("");
    if (!selStart) { setDateError("Please select a date."); valid = false; }
    else setDateError("");
    if (!valid) return;
    const base = {
      title: title.trim(),
      description: description.trim() || null,
      startDate: selStart,
      endDate: selEnd || selStart,
      startTime: timeStr,
    };

    if (route) {
      // The picker already computed the route — store it directly (no recompute).
      await createEvent({
        ...base,
        locLat: route.to.lat, locLng: route.to.lng, locName: route.to.name, osmUrl: route.to.osmUrl,
        originLat: route.from.lat, originLng: route.from.lng, originName: route.from.name,
        travelMode: route.mode,
        routeDistM: route.info?.distanceMeters ?? null,
        routeDurS: route.info?.durationSeconds ?? null,
        routeGeo: route.info ? JSON.stringify(route.info.coords) : null,
      });
    } else {
      await createEvent({
        ...base,
        locLat: location?.lat ?? null,
        locLng: location?.lng ?? null,
        locName: location?.name ?? null,
        osmUrl: location?.osmUrl ?? null,
      });
    }
    router.back();
  };

  const dateRangeLabel =
    !selStart
      ? "Tap a day to select"
      : selStart === selEnd
      ? formatShortDate(selStart)
      : `${formatShortDate(selStart)} – ${formatShortDate(selEnd)}`;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>New Event</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={[styles.input, !!titleError && styles.inputError]}
              placeholder="What's happening?"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={(t) => { setTitle(t); if (titleError) setTitleError(""); }}
              autoFocus
            />
            {!!titleError && <Text style={styles.errorText}>{titleError}</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="e.g. Going out drinking with colleagues after work…"
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Text style={styles.hint}>Helps the AI give you relevant tips for this event</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Date</Text>
            <View style={styles.dateRangeRow}>
              <Text style={styles.dateRangeLabel}>{dateRangeLabel}</Text>
              {selStart && (
                <Pressable
                  onPress={() => { setSelStart(""); setSelEnd(""); }}
                >
                  <Text style={styles.clearBtn}>Clear</Text>
                </Pressable>
              )}
            </View>
            {!!dateError && <Text style={styles.errorText}>{dateError}</Text>}
            <View style={styles.calendarCard}>
              <View style={styles.monthNav}>
                <Pressable
                  style={styles.navBtn}
                  onPress={() =>
                    setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                  }
                >
                  <Text style={styles.navText}>{"‹"}</Text>
                </Pressable>
                <Text style={styles.monthLabel}>
                  {calMonth.toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </Text>
                <Pressable
                  style={styles.navBtn}
                  onPress={() =>
                    setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                  }
                >
                  <Text style={styles.navText}>{"›"}</Text>
                </Pressable>
              </View>
              <MonthCalendar
                year={calMonth.getFullYear()}
                month={calMonth.getMonth()}
                selectionStart={selStart}
                selectionEnd={selEnd}
                onDaySelect={handleDaySelect}
                minDate={today}
              />
            </View>
            <Text style={styles.hint}>
              Tap once for a single day · tap again for end date
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Time (optional)</Text>
            <Pressable style={styles.locBtn} onPress={() => setTimeOpen(true)}>
              <Feather name="clock" size={18} color={time ? colors.green : colors.textMuted} />
              <Text style={[styles.locText, !time && styles.locPlaceholder]}>
                {timeStr ? format12h(timeStr) : "Add a start time"}
              </Text>
              {time && (
                <Pressable onPress={() => setTime(null)} hitSlop={8}>
                  <Feather name="x" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </Pressable>
            <Text style={styles.hint}>Enables precise reminders and "leave by"</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Location / directions (optional)</Text>
            <Pressable style={styles.locBtn} onPress={() => setPickerOpen(true)}>
              <Feather
                name={route ? "navigation" : "map-pin"}
                size={18}
                color={location || route ? colors.green : colors.textMuted}
              />
              <Text style={[styles.locText, !location && !route && styles.locPlaceholder]} numberOfLines={1}>
                {route
                  ? `${route.from.name ?? "Start"} → ${route.to.name ?? "Destination"}`
                  : location
                  ? (location.name ?? "Selected point")
                  : "Add a location or directions"}
              </Text>
              {(location || route) && (
                <Pressable onPress={() => { setLocation(null); setRoute(null); }} hitSlop={8}>
                  <Feather name="x" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.actions}>
          <ActionButton
            label="Save Event"
            onPress={handleSave}
            variant="primary"
            style={{ backgroundColor: colors.green }}
          />
        </View>
      </KeyboardAwareScrollView>

      <MapPickerModal
        visible={pickerOpen}
        directions={!!route}
        initial={location ? { lat: location.lat, lng: location.lng } : null}
        initialFrom={route ? { lat: route.from.lat, lng: route.from.lng, name: route.from.name } : null}
        initialTo={route ? { lat: route.to.lat, lng: route.to.lng, name: route.to.name } : null}
        onClose={() => setPickerOpen(false)}
        onPick={(p) => { setLocation(p); setRoute(null); }}
        onPickRoute={(from, to, mode, info) => { setRoute({ from, to, mode, info }); setLocation(null); }}
      />

      <DatePicker
        modal
        mode="time"
        open={timeOpen}
        date={time ?? new Date()}
        onConfirm={(d) => { setTimeOpen(false); setTime(d); }}
        onCancel={() => setTimeOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  backBtn: { marginBottom: spacing.md },
  backText: { ...typography.actionM, color: colors.primary },
  title: { ...typography.h1, color: colors.neutralDarkDarkest, marginBottom: spacing.xl },
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
  dateRangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  dateRangeLabel: { ...typography.h4, color: colors.green },
  clearBtn: { ...typography.actionS, color: colors.textMuted },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  navBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 20, color: colors.neutralDarkMedium },
  monthLabel: { ...typography.h4, color: colors.neutralDarkDarkest },
  hint: { ...typography.bodyXS, color: colors.textMuted, marginTop: spacing.sm },
  locBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  locText: { flex: 1, ...typography.bodyL, color: colors.neutralDarkDarkest },
  locPlaceholder: { color: colors.textMuted },
  inputError: { borderWidth: 1, borderColor: colors.errorDark },
  multiline: { minHeight: 80, paddingTop: 14 },
  errorText: { ...typography.bodyXS, color: colors.errorDark, marginTop: spacing.xs },
  actions: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
});
