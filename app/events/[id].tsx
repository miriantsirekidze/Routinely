import { useCallback, useState, useRef, useEffect } from "react";
import type { ScrollView as ScrollViewType } from "react-native";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Linking,
  Image,
  Modal,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useLLM, QWEN2_5_1_5B_QUANTIZED } from "react-native-executorch";
import Feather from "@expo/vector-icons/Feather";
import DatePicker from "react-native-date-picker";
import {
  getEventWithNotes,
  updateEvent,
  deleteEvent,
  upsertDayNote,
  deleteDayNote,
  saveLLMNote,
  addEventAttachment,
  deleteEventAttachment,
  CalendarEventWithNotes,
} from "../../src/db/events";
import { fetchOpenGraph } from "../../src/db/canvas-components";
import { fetchWeather, weatherLabel, DailyWeather } from "../../src/utils/weather";
import { scheduleReminder } from "../../src/utils/notifications";
import { listEventReminders, removeReminder, Reminder } from "../../src/utils/reminders";
import {
  getRoute, TRAVEL_MODES, TravelMode, LatLng, RouteResult, formatDistance, formatDuration,
} from "../../src/utils/routing";
import { hasOrsKey } from "../../src/config";
import MapPreview from "../../src/components/MapPreview";
import MapPickerModal, { PickedPlace } from "../../src/components/MapPickerModal";
import { formatShortDate, formatLongDate, localDateStr, format12h, combineDateTime } from "../../src/utils/date";
import { titleCase } from "../../src/utils/text";
import { colors, typography, spacing, radius } from "../../src/constants/theme";
import { buildEventPrompt } from "../../src/llm/config";

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T12:00:00");
  const endDate = new Date(end + "T12:00:00");
  while (current <= endDate) {
    dates.push(localDateStr(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = parseInt(id, 10);

  const [event, setEvent] = useState<CalendarEventWithNotes | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [remPickerOpen, setRemPickerOpen] = useState(false);
  const [routing, setRouting] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [fullImage, setFullImage] = useState<string | null>(null);
  const [weather, setWeather] = useState<DailyWeather[] | null>(null);
  const [llmNoteText, setLlmNoteText] = useState<string | null>(null);
  const noteRefs = useRef<Record<string, string>>({});
  const scrollRef = useRef<ScrollViewType>(null);
  const insets = useSafeAreaInsets();

  // Expo forces edge-to-edge on Android (adjustResize is defeated), so track the IME height
  // ourselves and pad the scroll content by it — lets focused inputs (e.g. the link URL)
  // scroll clear of the keyboard.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Once the keyboard height is known while adding a link, make sure the URL field is visible.
  useEffect(() => {
    if (keyboardHeight > 0 && linkMode) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    }
  }, [keyboardHeight, linkMode]);

  // Weather for the event's location + day(s). Cached on the event (refreshed after 3h or if
  // the location/dates change). Far-future/past events return null (open-meteo forecast range).
  useEffect(() => {
    const lat = event?.locLat;
    const lng = event?.locLng;
    if (!event || lat == null || lng == null) { setWeather(null); return; }
    let cached: { fetchedAt: number; start: string; end: string; data: DailyWeather[] } | null = null;
    try { cached = event.weatherCache ? JSON.parse(event.weatherCache) : null; } catch {}
    if (cached && cached.start === event.startDate && cached.end === event.endDate &&
        Date.now() - cached.fetchedAt < 3 * 3600 * 1000) {
      setWeather(cached.data);
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await fetchWeather(lat, lng, event.startDate, event.endDate);
      if (cancelled) return;
      setWeather(data);
      if (data && data.length) {
        updateEvent(eventId, {
          weatherCache: JSON.stringify({ fetchedAt: Date.now(), start: event.startDate, end: event.endDate, data }),
        });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.locLat, event?.locLng, event?.startDate, event?.endDate]);

  const generatingRef = useRef(false);

  const hasCachedNote = !!event?.llmNote;

  const llm = useLLM({
    model: QWEN2_5_1_5B_QUANTIZED,
    preventLoad: hasCachedNote,
  });

  const load = useCallback(async () => {
    const e = await getEventWithNotes(eventId);
    setEvent(e);
    if (e) {
      e.dayNotes.forEach((n) => { noteRefs.current[n.date] = n.note; });
      if (e.llmNote) setLlmNoteText(e.llmNote);
    }
    setReminders(await listEventReminders(eventId));
  }, [eventId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Generate event tip when model is ready and no cache exists
  useEffect(() => {
    if (!llm.isReady || hasCachedNote || !event || generatingRef.current) return;

    generatingRef.current = true;
    const messages = buildEventPrompt(event.title, event.description);
    llm.generate(messages as any).then((text) => {
      if (text) {
        setLlmNoteText(text);
        saveLLMNote(eventId, text);
      }
      generatingRef.current = false;
    }).catch(() => { generatingRef.current = false; });
  }, [llm.isReady, hasCachedNote, event]);

  // Interrupt on unmount to prevent crash
  useEffect(() => {
    return () => { if (llm.isGenerating) llm.interrupt(); };
  }, [llm.isGenerating, llm.interrupt]);

  const handleToggleComplete = async () => {
    if (!event) return;
    await updateEvent(eventId, { completed: !event.completed });
    load();
  };

  const handleDelete = async () => {
    await deleteEvent(eventId);
    router.back();
  };

  // Single location: also clears any existing route (event becomes a plain location).
  const handlePickLocation = async (place: PickedPlace) => {
    await updateEvent(eventId, {
      locLat: place.lat, locLng: place.lng, locName: place.name, osmUrl: place.osmUrl,
      originLat: null, originLng: null, originName: null,
      routeDistM: null, routeDurS: null, routeGeo: null,
    });
    load();
  };

  const handleRemoveLocation = async () => {
    await updateEvent(eventId, {
      locLat: null, locLng: null, locName: null, osmUrl: null,
      originLat: null, originLng: null, originName: null,
      routeDistM: null, routeDurS: null, routeGeo: null,
    });
    load();
  };

  const openInMaps = (lat: number, lng: number, name: string | null) => {
    const label = encodeURIComponent(name ?? "Event location");
    Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${label})`).catch(() => {});
  };

  const handleSetTime = async (d: Date) => {
    const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    await updateEvent(eventId, { startTime: hhmm });
    load();
  };
  const handleClearTime = async () => {
    await updateEvent(eventId, { startTime: null });
    load();
  };

  // Schedule a reminder at an absolute time, tagged to this event.
  const addReminderAt = async (fireAt: Date, body?: string) => {
    if (!event || fireAt.getTime() <= Date.now()) return;
    await scheduleReminder(body ?? event.title, fireAt, eventId);
    setReminders(await listEventReminders(eventId));
  };
  const deleteReminder = async (rid: string) => {
    await removeReminder(rid);
    setReminders(await listEventReminders(eventId));
  };

  const addPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (!res.canceled && res.assets.length) {
      for (const asset of res.assets) {
        await addEventAttachment(eventId, { kind: "photo", uri: asset.uri });
      }
      load();
    }
  };

  const addLink = async () => {
    let url = linkUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    setAddingLink(true);
    const og = await fetchOpenGraph(url);
    setAddingLink(false);
    await addEventAttachment(eventId, { kind: "link", uri: url, title: og?.title ?? null });
    setLinkUrl("");
    setLinkMode(false);
    load();
  };

  const removeAttachment = async (aid: number) => {
    await deleteEventAttachment(aid);
    load();
  };

  const computeRoute = async (
    oLat: number, oLng: number, oName: string | null,
    dLat: number, dLng: number, mode: TravelMode
  ) => {
    setRouting(true);
    const r = await getRoute({ lat: oLat, lng: oLng }, { lat: dLat, lng: dLng }, mode);
    setRouting(false);
    if (!r) return;
    await updateEvent(eventId, {
      originLat: oLat, originLng: oLng, originName: oName, travelMode: mode,
      routeDistM: r.distanceMeters, routeDurS: r.durationSeconds,
      routeGeo: JSON.stringify(r.coords),
    });
    load();
  };

  const handleNoteBlur = async (date: string) => {
    const note = noteRefs.current[date] ?? "";
    await upsertDayNote(eventId, date, { note });
  };

  const handleDayComplete = async (date: string, current: boolean) => {
    await upsertDayNote(eventId, date, { completed: !current });
    load();
  };

  const handleDeleteDayNote = async (date: string) => {
    await deleteDayNote(eventId, date);
    noteRefs.current[date] = "";
    load();
  };

  const getNoteForDate = (date: string) =>
    event?.dayNotes.find((n) => n.date === date)?.note ?? "";

  const isDayCompleted = (date: string) =>
    event?.dayNotes.find((n) => n.date === date)?.completed ?? false;

  const hasDayNote = (date: string) =>
    !!event?.dayNotes.find((n) => n.date === date);

  if (!event) return null;

  const isMultiDay = event.startDate !== event.endDate;
  const dates = getDatesInRange(event.startDate, event.endDate);
  const dateRangeLabel = isMultiDay
    ? `${formatShortDate(event.startDate)} – ${formatShortDate(event.endDate)}`
    : formatLongDate(event.startDate);

  const eventStart = combineDateTime(event.startDate, event.startTime);
  const remDefault = eventStart.getTime() > Date.now() ? eventStart : new Date(Date.now() + 3600000);
  const reminderPresets = event.startTime
    ? [
        { label: "At start", offsetMin: 0 },
        { label: "15 min before", offsetMin: 15 },
        { label: "1 hour before", offsetMin: 60 },
        { label: "1 day before", offsetMin: 1440 },
      ]
    : [];
  const fmtRem = (ms: number) =>
    new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  // Route is fully per-event — origin comes only from this event (no cross-event default).
  const hasDest = event.locLat != null && event.locLng != null;
  const originLat = event.originLat;
  const originLng = event.originLng;
  const originName = event.originName;
  const hasOrigin = originLat != null && originLng != null;
  const mode: TravelMode = (event.travelMode as TravelMode) ?? "driving-car";
  const leaveBy =
    event.startTime && event.routeDurS != null
      ? new Date(eventStart.getTime() - event.routeDurS * 1000)
      : null;
  const leaveByValid = !!leaveBy && leaveBy.getTime() > Date.now();
  const routeCoords: LatLng[] | null = (() => {
    if (!event.routeGeo) return null;
    try { return JSON.parse(event.routeGeo) as LatLng[]; } catch { return null; }
  })();
  const hasRoute = hasOrigin && hasDest && !!routeCoords;
  const photos = event.attachments.filter((a) => a.kind === "photo");
  const links = event.attachments.filter((a) => a.kind === "link");

  const handleSetMode = async (m: TravelMode) => {
    if (hasOrigin && hasDest) {
      await computeRoute(originLat!, originLng!, originName, event.locLat!, event.locLng!, m);
    } else {
      await updateEvent(eventId, { travelMode: m });
      load();
    }
  };

  // From the directions picker: it already computed the route, so store it directly. Also
  // remember the origin silently as the default next time.
  const handlePickRoute = async (
    fromP: PickedPlace, toP: PickedPlace, m: TravelMode, info: RouteResult | null
  ) => {
    setPickerOpen(false);
    await updateEvent(eventId, {
      locLat: toP.lat, locLng: toP.lng, locName: toP.name, osmUrl: toP.osmUrl,
      originLat: fromP.lat, originLng: fromP.lng, originName: fromP.name,
      travelMode: m,
      routeDistM: info?.distanceMeters ?? null,
      routeDurS: info?.durationSeconds ?? null,
      routeGeo: info ? JSON.stringify(info.coords) : null,
    });
    load();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          {confirmDelete ? (
            <View style={styles.confirmRow}>
              <Pressable onPress={() => setConfirmDelete(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmDeleteBtn} onPress={handleDelete}>
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirmDelete(true)}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.eventTitle}>{titleCase(event.title)}</Text>
          <Text style={styles.dateRange}>
            {dateRangeLabel}{event.startTime ? ` · ${format12h(event.startTime)}` : ""}
          </Text>
          <View style={styles.timeEditRow}>
            <Pressable style={styles.timeEdit} onPress={() => setTimeOpen(true)}>
              <Feather name="clock" size={13} color={colors.primary} />
              <Text style={styles.timeEditText}>{event.startTime ? "Change time" : "Add time"}</Text>
            </Pressable>
            {event.startTime && (
              <Pressable onPress={handleClearTime} hitSlop={8}>
                <Text style={styles.timeClear}>Clear</Text>
              </Pressable>
            )}
          </View>
          {event.description ? (
            <Text style={styles.description}>{event.description}</Text>
          ) : null}
        </View>

        {/* Map card — a route if one is set, otherwise a single location */}
        {hasDest ? (
          <View style={styles.mapCard}>
            <View>
              <MapPreview
                lat={event.locLat!}
                lng={event.locLng!}
                route={hasRoute ? routeCoords! : undefined}
                height={160}
                rounded={false}
              />
              {hasRoute && event.routeDistM != null && event.routeDurS != null && (
                <View style={styles.mapBadge}>
                  <Feather
                    name={(TRAVEL_MODES.find((m) => m.mode === mode)?.icon ?? "navigation") as any}
                    size={13}
                    color={colors.white}
                  />
                  <Text style={styles.mapBadgeText}>
                    {formatDuration(event.routeDurS)}  ·  {formatDistance(event.routeDistM)}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.mapBody}>
              <Text style={styles.mapPlace} numberOfLines={1}>
                {event.locName ?? "Location"}
              </Text>
              {hasRoute && originName && (
                <Text style={styles.mapSub} numberOfLines={1}>from {originName}</Text>
              )}

              {hasRoute && (
                <View style={styles.modeRow}>
                  {TRAVEL_MODES.map((m) => (
                    <Pressable
                      key={m.mode}
                      style={[styles.modeChip, mode === m.mode && styles.modeChipActive]}
                      onPress={() => handleSetMode(m.mode)}
                    >
                      <Feather name={m.icon as any} size={13} color={mode === m.mode ? colors.white : colors.neutralDarkMedium} />
                      <Text style={[styles.modeChipText, mode === m.mode && styles.modeChipTextActive]}>{m.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {hasRoute && leaveBy && (
                <View style={styles.leaveByBox}>
                  <View>
                    <Text style={styles.leaveByLabel}>LEAVE BY</Text>
                    <Text style={styles.leaveByTime}>
                      {leaveBy.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </Text>
                  </View>
                  {leaveByValid && (
                    <Pressable
                      style={styles.remindBtn}
                      onPress={() => addReminderAt(leaveBy, `Leave now for ${event.title}`)}
                    >
                      <Feather name="bell" size={13} color={colors.primary} />
                      <Text style={styles.remindBtnText}>Remind me</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {routing && <Text style={styles.hintText}>Routing…</Text>}
              {hasRoute && !event.startTime && (
                <Text style={styles.hintText}>Add a start time for a "leave by" time.</Text>
              )}
              {!hasRoute && !hasOrsKey && (
                <Text style={styles.hintText}>Add EXPO_PUBLIC_ORS_API_KEY (.env) for directions.</Text>
              )}

              <View style={styles.actionRow}>
                <Pressable style={styles.actionBtn} onPress={() => openInMaps(event.locLat!, event.locLng!, event.locName)}>
                  <Feather name="navigation" size={16} color={colors.primary} />
                  <Text style={styles.actionLabel}>Open</Text>
                </Pressable>
                <View style={styles.actionSep} />
                <Pressable style={styles.actionBtn} onPress={() => setPickerOpen(true)}>
                  <Feather name="edit-2" size={16} color={colors.primary} />
                  <Text style={styles.actionLabel}>Edit</Text>
                </Pressable>
                <View style={styles.actionSep} />
                <Pressable style={styles.actionBtn} onPress={handleRemoveLocation}>
                  <Feather name="trash-2" size={16} color={colors.errorDark} />
                  <Text style={[styles.actionLabel, { color: colors.errorDark }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <Pressable style={styles.addLocBtn} onPress={() => setPickerOpen(true)}>
            <Feather name="map-pin" size={16} color={colors.primary} />
            <Text style={styles.addLocText}>Add location or directions</Text>
          </Pressable>
        )}

        {/* Weather */}
        {weather && weather.length > 0 && (
          <View style={styles.weatherCard}>
            <Text style={styles.weatherTitle}>Weather</Text>
            {weather.map((day) => {
              const { label, icon } = weatherLabel(day.code);
              return (
                <View key={day.date} style={styles.weatherRow}>
                  <Feather name={icon as any} size={18} color={colors.primary} />
                  <View style={styles.weatherDayCol}>
                    <Text style={styles.weatherDay}>{formatShortDate(day.date)}</Text>
                    <Text style={styles.weatherDesc}>{label}</Text>
                  </View>
                  {day.precip > 0 && (
                    <View style={styles.weatherPrecip}>
                      <Feather name="droplet" size={12} color={colors.primary} />
                      <Text style={styles.weatherPrecipText}>{day.precip}%</Text>
                    </View>
                  )}
                  <Text style={styles.weatherTemp}>
                    {Math.round(day.tMax)}° <Text style={styles.weatherTempMin}>{Math.round(day.tMin)}°</Text>
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* AI tip card */}
        {(llmNoteText || llm.isGenerating || llm.error ||
          (!hasCachedNote && (llm.downloadProgress > 0 || llm.isReady))) && (
          <View style={styles.tipCard}>
            <Text style={styles.tipLabel}>✦ AI tip</Text>
            {llmNoteText ? (
              <Text style={styles.tipText}>{llmNoteText}</Text>
            ) : llm.isGenerating ? (
              <Text style={styles.tipText}>{llm.response || "Generating…"}</Text>
            ) : llm.error ? (
              <Text style={styles.tipLoading}>
                Model is downloading in the background — come back in a moment.
              </Text>
            ) : llm.downloadProgress > 0 && llm.downloadProgress < 1 ? (
              <Text style={styles.tipLoading}>
                Downloading model… {Math.round(llm.downloadProgress * 100)}%
              </Text>
            ) : (
              <Text style={styles.tipLoading}>Loading model…</Text>
            )}
          </View>
        )}

        <Pressable
          style={[styles.completeToggle, event.completed && styles.completeToggleOn]}
          onPress={handleToggleComplete}
        >
          <Text style={[styles.completeToggleText, event.completed && styles.completeToggleTextOn]}>
            {event.completed ? "✓ Completed" : "Mark as complete"}
          </Text>
        </Pressable>

        <View style={styles.plansSection}>
          <Text style={styles.plansSectionTitle}>
            {isMultiDay ? "Day plans" : "Plan"}
          </Text>
          {dates.map((date) => {
            const dayDone = isDayCompleted(date);
            const hasNote = hasDayNote(date);
            return (
              <View key={date} style={styles.dayCard}>
                {isMultiDay && (
                  <View style={styles.dayCardHeader}>
                    <Text style={styles.dayCardDate}>{formatShortDate(date)}</Text>
                    <View style={styles.dayCardActions}>
                      {hasNote && (
                        <Pressable
                          onPress={() => handleDeleteDayNote(date)}
                          hitSlop={8}
                        >
                          <Text style={styles.clearBtn}>Clear</Text>
                        </Pressable>
                      )}
                      <Pressable
                        style={[styles.dayCheck, dayDone && styles.dayCheckOn]}
                        onPress={() => handleDayComplete(date, dayDone)}
                      >
                        <Text style={[styles.dayCheckText, dayDone && styles.dayCheckTextOn]}>
                          {dayDone ? "✓ Done" : "Done?"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
                <TextInput
                  style={styles.noteInput}
                  placeholder="Plan for this day…"
                  placeholderTextColor={colors.textMuted}
                  defaultValue={getNoteForDate(date)}
                  onChangeText={(text) => { noteRefs.current[date] = text; }}
                  onBlur={() => handleNoteBlur(date)}
                  multiline
                />
                {!isMultiDay && (
                  <View style={styles.singleDayFooter}>
                    {hasNote && (
                      <Pressable onPress={() => handleDeleteDayNote(date)}>
                        <Text style={styles.clearBtn}>Clear</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.dayCheck, dayDone && styles.dayCheckOn]}
                      onPress={() => handleDayComplete(date, dayDone)}
                    >
                      <Text style={[styles.dayCheckText, dayDone && styles.dayCheckTextOn]}>
                        {dayDone ? "✓ Done" : "Done?"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Reminders */}
        <View style={styles.remSection}>
          <Text style={styles.remTitle}>Reminders</Text>
          {reminders.length > 0 && (
            <View style={styles.remList}>
              {reminders.map((r) => (
                <View key={r.id} style={styles.remRow}>
                  <Feather name="bell" size={15} color={colors.primary} />
                  <Text style={styles.remTime}>{fmtRem(r.fireAt)}</Text>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => deleteReminder(r.id)} hitSlop={8}>
                    <Feather name="trash-2" size={16} color={colors.errorDark} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <View style={styles.remChips}>
            {reminderPresets.map((p) => {
              const fire = new Date(eventStart.getTime() - p.offsetMin * 60000);
              const disabled = fire.getTime() <= Date.now();
              return (
                <Pressable
                  key={p.label}
                  disabled={disabled}
                  style={[styles.remChip, disabled && styles.remChipDisabled]}
                  onPress={() => addReminderAt(fire)}
                >
                  <Text style={styles.remChipText}>{p.label}</Text>
                </Pressable>
              );
            })}
            <Pressable style={styles.remChip} onPress={() => setRemPickerOpen(true)}>
              <Text style={styles.remChipText}>Custom</Text>
            </Pressable>
          </View>
          {!event.startTime && (
            <Text style={styles.remHint}>Add a start time above for "before" reminders.</Text>
          )}
        </View>

        {/* Attachments */}
        <View style={styles.attachSection}>
          <Text style={styles.remTitle}>Attachments</Text>

          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {photos.map((a) => (
                <View key={a.id} style={styles.photoWrap}>
                  <Pressable onPress={() => setFullImage(a.uri)}>
                    <Image source={{ uri: a.uri }} style={styles.photoThumb} />
                  </Pressable>
                  <Pressable style={styles.photoRemove} onPress={() => removeAttachment(a.id)} hitSlop={6}>
                    <Feather name="x" size={13} color={colors.white} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          {links.map((a) => (
            <View key={a.id} style={styles.linkRow}>
              <Feather name="link" size={15} color={colors.primary} />
              <Pressable style={styles.linkTextWrap} onPress={() => Linking.openURL(a.uri).catch(() => {})}>
                <Text style={styles.linkTitle} numberOfLines={1}>{a.title ?? a.uri}</Text>
                {a.title ? <Text style={styles.linkUrl} numberOfLines={1}>{a.uri}</Text> : null}
              </Pressable>
              <Pressable onPress={() => removeAttachment(a.id)} hitSlop={8}>
                <Feather name="trash-2" size={15} color={colors.errorDark} />
              </Pressable>
            </View>
          ))}

          {linkMode && (
            <View style={styles.linkInputRow}>
              <TextInput
                style={styles.linkInput}
                value={linkUrl}
                onChangeText={setLinkUrl}
                placeholder="https://…"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={addLink}
                autoFocus
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
              />
              <Pressable onPress={addLink} hitSlop={8}>
                {addingLink ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Feather name="arrow-up-circle" size={22} color={linkUrl.trim() ? colors.primary : colors.neutralLightDark} />
                )}
              </Pressable>
            </View>
          )}

          <View style={styles.attachBtns}>
            <Pressable style={styles.attachBtn} onPress={addPhoto}>
              <Feather name="image" size={15} color={colors.primary} />
              <Text style={styles.attachBtnText}>Photo</Text>
            </Pressable>
            <Pressable style={styles.attachBtn} onPress={() => setLinkMode((m) => !m)}>
              <Feather name="link" size={15} color={colors.primary} />
              <Text style={styles.attachBtnText}>Link</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal visible={!!fullImage} transparent animationType="fade" onRequestClose={() => setFullImage(null)}>
        <Pressable style={styles.imgModal} onPress={() => setFullImage(null)}>
          {fullImage && <Image source={{ uri: fullImage }} style={styles.imgFull} resizeMode="contain" />}
        </Pressable>
      </Modal>

      <MapPickerModal
        visible={pickerOpen}
        directions={hasRoute}
        initial={hasDest ? { lat: event.locLat!, lng: event.locLng! } : null}
        initialFrom={hasOrigin ? { lat: originLat!, lng: originLng!, name: originName } : null}
        initialTo={hasDest ? { lat: event.locLat!, lng: event.locLng!, name: event.locName } : null}
        onClose={() => setPickerOpen(false)}
        onPick={handlePickLocation}
        onPickRoute={handlePickRoute}
      />

      <DatePicker
        modal
        mode="time"
        open={timeOpen}
        date={eventStart}
        onConfirm={(d) => { setTimeOpen(false); handleSetTime(d); }}
        onCancel={() => setTimeOpen(false)}
      />
      <DatePicker
        modal
        mode="datetime"
        open={remPickerOpen}
        date={remDefault}
        minimumDate={new Date()}
        onConfirm={(d) => { setRemPickerOpen(false); addReminderAt(d); }}
        onCancel={() => setRemPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  mapCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  mapBody: { padding: spacing.md, gap: spacing.sm },
  mapPlace: { ...typography.h4, color: colors.neutralDarkDarkest },
  mapSub: { ...typography.bodyS, color: colors.textMuted, marginTop: -spacing.xs },
  mapBadge: {
    position: "absolute",
    left: spacing.sm,
    bottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(31,32,36,0.82)",
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
  },
  mapBadgeText: { ...typography.actionM, color: colors.white },
  leaveByBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primaryLightest,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  leaveByLabel: { ...typography.captionM, color: colors.textMuted, letterSpacing: 0.5 },
  leaveByTime: { ...typography.h3, color: colors.green },
  remindBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
  },
  remindBtnText: { ...typography.actionM, color: colors.primary },
  hintText: { ...typography.bodyXS, color: colors.textMuted },
  actionRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
  },
  actionSep: { width: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  actionLabel: { ...typography.actionM, color: colors.primary },
  timeEditRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  timeEdit: { flexDirection: "row", alignItems: "center", gap: 4 },
  timeEditText: { ...typography.actionM, color: colors.primary },
  timeClear: { ...typography.actionM, color: colors.textMuted },
  remSection: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  remTitle: { ...typography.h4, color: colors.neutralDarkDarkest, marginBottom: spacing.md },
  remList: { marginBottom: spacing.md },
  remRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  remTime: { ...typography.bodyM, color: colors.neutralDarkDarkest },
  remChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  remChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLightest,
  },
  remChipDisabled: { opacity: 0.4 },
  remChipText: { ...typography.actionM, color: colors.primary },
  remHint: { ...typography.bodyXS, color: colors.textMuted, marginTop: spacing.sm },
  attachSection: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  photoRow: { gap: spacing.sm, paddingBottom: spacing.sm },
  photoWrap: { position: "relative" },
  photoThumb: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surface },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(31,32,36,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkTextWrap: { flex: 1 },
  linkTitle: { ...typography.bodyM, color: colors.neutralDarkDarkest },
  linkUrl: { ...typography.bodyXS, color: colors.textMuted },
  linkInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  linkInput: { flex: 1, ...typography.bodyM, color: colors.neutralDarkDarkest, padding: 0 },
  attachBtns: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLightest,
  },
  attachBtnText: { ...typography.actionM, color: colors.primary },
  imgModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  imgFull: { width: "100%", height: "80%" },
  weatherCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  weatherTitle: { ...typography.h4, color: colors.neutralDarkDarkest, marginBottom: spacing.sm },
  weatherRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  weatherDayCol: { flex: 1 },
  weatherDay: { ...typography.bodyM, color: colors.neutralDarkDarkest, fontWeight: "600" },
  weatherDesc: { ...typography.bodyS, color: colors.textMuted },
  weatherPrecip: { flexDirection: "row", alignItems: "center", gap: 3 },
  weatherPrecipText: { ...typography.bodyS, color: colors.primary },
  weatherTemp: { ...typography.bodyL, color: colors.neutralDarkDarkest, fontWeight: "700" },
  weatherTempMin: { ...typography.bodyM, color: colors.textMuted, fontWeight: "400" },
  modeRow: { flexDirection: "row", gap: spacing.sm },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.background,
  },
  modeChipActive: { backgroundColor: colors.primary },
  modeChipText: { ...typography.actionM, color: colors.neutralDarkMedium },
  modeChipTextActive: { color: colors.white },
  addLocBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primaryLightest,
    borderRadius: radius.lg,
  },
  addLocText: { ...typography.actionM, color: colors.primary },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  backText: { ...typography.actionM, color: colors.primary },
  deleteText: { ...typography.actionM, color: colors.errorDark },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cancelText: { ...typography.actionM, color: colors.textMuted },
  confirmDeleteBtn: {
    backgroundColor: colors.errorLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  confirmDeleteText: { ...typography.actionM, color: colors.errorDark },
  titleSection: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  eventTitle: { ...typography.h1, color: colors.neutralDarkDarkest },
  dateRange: { ...typography.bodyM, color: colors.green, marginTop: spacing.xs, fontWeight: "600" },
  description: { ...typography.bodyM, color: colors.textSecondary, marginTop: spacing.sm },
  tipCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.greenLightest,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  tipLabel: {
    ...typography.captionM,
    color: colors.green,
    marginBottom: spacing.xs,
  },
  tipText: {
    ...typography.bodyM,
    color: colors.greenDark,
    lineHeight: 22,
  },
  tipLoading: {
    ...typography.bodyS,
    color: colors.green,
    opacity: 0.7,
  },
  completeToggle: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.greenLight,
    alignItems: "center",
    backgroundColor: colors.background,
  },
  completeToggleOn: { backgroundColor: colors.green, borderColor: colors.green },
  completeToggleText: { ...typography.actionM, color: colors.green },
  completeToggleTextOn: { color: colors.white },
  plansSection: { paddingHorizontal: spacing.lg },
  plansSectionTitle: { ...typography.h4, color: colors.neutralDarkDarkest, marginBottom: spacing.md },
  dayCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  dayCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    marginBottom: spacing.xs,
  },
  dayCardDate: { ...typography.h5, color: colors.green },
  dayCardActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  clearBtn: { ...typography.actionS, color: colors.textMuted },
  noteInput: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    ...typography.bodyM,
    color: colors.neutralDarkDarkest,
    minHeight: 64,
    textAlignVertical: "top",
  },
  singleDayFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  dayCheck: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.greenLight,
  },
  dayCheckOn: { backgroundColor: colors.green, borderColor: colors.green },
  dayCheckText: { ...typography.actionS, color: colors.green },
  dayCheckTextOn: { color: colors.white },
});
