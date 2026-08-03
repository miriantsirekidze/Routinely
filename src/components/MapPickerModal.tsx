import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Modal, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import Feather from "@expo/vector-icons/Feather";
import { searchPlace, reverseGeocode, osmUrlFor } from "../utils/geocode";
import { getRoute, TRAVEL_MODES, TravelMode, RouteResult, formatDistance, formatDuration } from "../utils/routing";
import { colors, typography, spacing, radius } from "../constants/theme";

export type PickedPlace = { lat: number; lng: number; name: string | null; osmUrl: string };
type Pt = { lat: number; lng: number; name: string | null } | null;
type Field = "single" | "from" | "to";

const GEORGIA = { lat: 42.3154, lng: 43.3569, zoom: 7 };
// Numbered badges: origin (from) = 1, destination (to) = 2. Single pick has no number.
const MARKER_LABEL: Record<Field, string> = { single: "", from: "1", to: "2" };

type Props = {
  visible: boolean;
  initial?: { lat: number; lng: number } | null;
  initialFrom?: { lat: number; lng: number; name?: string | null } | null;
  initialTo?: { lat: number; lng: number; name?: string | null } | null;
  /** Start in directions (from/to) mode and show the toggle. */
  directions?: boolean;
  onClose: () => void;
  onPick?: (place: PickedPlace) => void;
  onPickRoute?: (from: PickedPlace, to: PickedPlace, mode: TravelMode, route: RouteResult | null) => void;
};

const MAP_HTML = (() => {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0;padding:0;background:#fff}.leaflet-control-attribution{font-size:8px}.leaflet-control-zoom{display:none}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map=L.map('map',{zoomControl:false}).setView([${GEORGIA.lat},${GEORGIA.lng}],${GEORGIA.zoom});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  var markers={}, routeLine=null;
  function post(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  // Blue pin; numbered when a label is given (markers live in the markerPane, above the route).
  function pinIcon(label){ var s=label?24:16; return L.divIcon({className:'',html:'<div style="width:'+s+'px;height:'+s+'px;border-radius:50%;background:#006FFD;border:2px solid #fff;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.35)">'+label+'</div>',iconSize:[s,s],iconAnchor:[s/2,s/2]}); }
  window.rnSet=function(id,la,ln,label){ if(markers[id]){markers[id].setLatLng([la,ln]);}else{markers[id]=L.marker([la,ln],{icon:pinIcon(label)}).addTo(map);} };
  window.rnRemove=function(id){ if(markers[id]){map.removeLayer(markers[id]);delete markers[id];} };
  window.rnCenter=function(la,ln,z){ map.setView([la,ln],z||15); };
  window.rnFit=function(){ if(markers.from&&markers.to){ map.fitBounds(L.latLngBounds([markers.from.getLatLng(),markers.to.getLatLng()]).pad(0.35)); } };
  window.rnRoute=function(coords){ if(routeLine){map.removeLayer(routeLine);} routeLine=L.polyline(coords,{color:'#006FFD',weight:6,opacity:0.9}).addTo(map); try{map.fitBounds(routeLine.getBounds().pad(0.2));}catch(e){} };
  window.rnClearRoute=function(){ if(routeLine){map.removeLayer(routeLine);routeLine=null;} };
  map.on('click',function(e){ post({type:'pick',lat:e.latlng.lat,lng:e.latlng.lng}); });
  post({type:'ready'});
  true;
</script></body></html>`;
})();

export default function MapPickerModal({
  visible, initial, initialFrom, initialTo, directions, onClose, onPick, onPickRoute,
}: Props) {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [isDirections, setIsDirections] = useState(!!directions);
  const [single, setSingle] = useState<Pt>(initial ? { ...initial, name: null } : null);
  const [from, setFrom] = useState<Pt>(initialFrom ? { lat: initialFrom.lat, lng: initialFrom.lng, name: initialFrom.name ?? null } : null);
  const [to, setTo] = useState<Pt>(initialTo ? { lat: initialTo.lat, lng: initialTo.lng, name: initialTo.name ?? null } : null);
  const [active, setActive] = useState<Field>(directions ? "from" : "single");
  const [q, setQ] = useState("");
  const [fromQ, setFromQ] = useState(initialFrom?.name ?? "");
  const [toQ, setToQ] = useState(initialTo?.name ?? "");
  const [searching, setSearching] = useState<Field | null>(null);
  const [focused, setFocused] = useState<Field | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("driving-car");
  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Live route: whenever both endpoints (and the mode) are set, fetch the real ORS route and
  // draw it. No Save needed to see it; the result is handed to the caller on Save.
  useEffect(() => {
    if (!isDirections || !from || !to) { setRouteInfo(null); return; }
    let cancelled = false;
    setRouteLoading(true);
    webRef.current?.injectJavaScript(`window.rnClearRoute && window.rnClearRoute(); true;`);
    (async () => {
      const r = await getRoute({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }, travelMode);
      if (cancelled) return;
      setRouteLoading(false);
      setRouteInfo(r);
      if (r) webRef.current?.injectJavaScript(`window.rnRoute(${JSON.stringify(r.coords)}); true;`);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirections, from?.lat, from?.lng, to?.lat, to?.lng, travelMode]);

  const setField = (f: Field, pt: Pt) => {
    if (f === "single") setSingle(pt);
    else if (f === "from") setFrom(pt);
    else setTo(pt);
    if (pt) webRef.current?.injectJavaScript(`window.rnSet('${f}',${pt.lat},${pt.lng},'${MARKER_LABEL[f]}'); true;`);
    else webRef.current?.injectJavaScript(`window.rnRemove('${f}'); true;`);
  };

  // Draw only the markers relevant to the CURRENT mode (so a leftover From pin from a
  // remembered origin never shows while picking a single location). Runs on map-ready and
  // whenever the mode toggles.
  useEffect(() => {
    const w = webRef.current;
    if (!mapReady || !w) return;
    w.injectJavaScript(
      `window.rnRemove('single');window.rnRemove('from');window.rnRemove('to');window.rnClearRoute&&window.rnClearRoute();true;`
    );
    if (isDirections) {
      if (from) w.injectJavaScript(`window.rnSet('from',${from.lat},${from.lng},'${MARKER_LABEL.from}');true;`);
      if (to) w.injectJavaScript(`window.rnSet('to',${to.lat},${to.lng},'${MARKER_LABEL.to}');true;`);
      if (from && to) w.injectJavaScript(`window.rnFit();true;`);
      else {
        const f = to ?? from;
        if (f) w.injectJavaScript(`window.rnCenter(${f.lat},${f.lng},14);true;`);
      }
    } else if (single) {
      w.injectJavaScript(`window.rnSet('single',${single.lat},${single.lng},'');window.rnCenter(${single.lat},${single.lng},14);true;`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, isDirections]);

  const onMessage = async (e: { nativeEvent: { data: string } }) => {
    let msg: any;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === "ready") { setMapReady(true); return; }
    if (msg.type === "pick") {
      const f = isDirections ? active : "single";
      setField(f, { lat: msg.lat, lng: msg.lng, name: null });
      const name = await reverseGeocode(msg.lat, msg.lng);
      setField(f, { lat: msg.lat, lng: msg.lng, name });
      if (f === "from") setFromQ(name ?? ""); else if (f === "to") setToQ(name ?? "");
    }
  };

  const runSearch = async (f: Field, text: string) => {
    if (!text.trim()) return;
    setSearching(f);
    const results = await searchPlace(text);
    setSearching(null);
    const r = results[0];
    if (!r) return;
    setField(f, { lat: r.lat, lng: r.lng, name: r.name });
    if (f === "from") setFromQ(r.name); else if (f === "to") setToQ(r.name);
    webRef.current?.injectJavaScript(`window.rnCenter(${r.lat},${r.lng},15); true;`);
  };

  const canSave = isDirections ? !!(from && to) : !!single;

  const confirm = () => {
    if (isDirections) {
      if (from && to && onPickRoute) {
        onPickRoute(
          { lat: from.lat, lng: from.lng, name: from.name, osmUrl: osmUrlFor(from.lat, from.lng) },
          { lat: to.lat, lng: to.lng, name: to.name, osmUrl: osmUrlFor(to.lat, to.lng) },
          travelMode,
          routeInfo
        );
      }
    } else if (single && onPick) {
      onPick({ lat: single.lat, lng: single.lng, name: single.name, osmUrl: osmUrlFor(single.lat, single.lng) });
    }
    onClose();
  };

  // A plain function returning JSX (NOT a nested component) — inlining keeps the TextInput's
  // identity across renders so it doesn't lose focus on each keystroke.
  const renderInput = (
    field: Field, value: string, onChangeText: (t: string) => void, placeholder: string, badge: string
  ) => (
    <Pressable
      style={[styles.inputRow, active === field && isDirections && styles.inputRowActive]}
      onPress={() => setActive(field)}
    >
      {badge ? (
        <View style={styles.numBadge}><Text style={styles.numBadgeText}>{badge}</Text></View>
      ) : (
        <View style={styles.singleDot} />
      )}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => { setActive(field); setFocused(field); }}
        onBlur={() => setFocused((f) => (f === field ? null : f))}
        // When blurred, pin the caret to the start so long addresses show their beginning
        // (instead of scrolling to the end where typing left it).
        selection={focused === field ? undefined : { start: 0, end: 0 }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        onSubmitEditing={() => runSearch(field, value)}
      />
      {searching === field && <ActivityIndicator size="small" color={colors.primary} />}
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} transparent>
      <View style={styles.root}>
        <WebView
          ref={webRef}
          style={StyleSheet.absoluteFill}
          originWhitelist={["*"]}
          source={{ html: MAP_HTML }}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
        />

        {/* Floating control card */}
        <View style={[styles.card, { top: insets.top + spacing.md }]}>
          <View style={styles.topRow}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            {onPickRoute && (
              <Pressable
                style={styles.dirToggle}
                onPress={() => { setIsDirections((d) => !d); setActive(!isDirections ? "from" : "single"); }}
              >
                <Feather name={isDirections ? "map-pin" : "corner-up-right"} size={14} color={colors.primary} />
                <Text style={styles.dirToggleText}>{isDirections ? "Single" : "Directions"}</Text>
              </Pressable>
            )}
            <Pressable onPress={confirm} disabled={!canSave} hitSlop={8}>
              <Text style={[styles.save, !canSave && styles.saveDisabled]}>Save</Text>
            </Pressable>
          </View>

          {isDirections ? (
            <>
              {renderInput("from", fromQ, setFromQ, "From — search or tap map", MARKER_LABEL.from)}
              <View style={styles.divider} />
              {renderInput("to", toQ, setToQ, "To — search or tap map", MARKER_LABEL.to)}
            </>
          ) : (
            renderInput("single", q, setQ, "Search a place or tap the map", MARKER_LABEL.single)
          )}
        </View>

        {/* Bottom: mode selector + route summary (directions), else a hint pill */}
        {isDirections ? (
          <View style={[styles.bottomCard, { bottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modeRow}>
              {TRAVEL_MODES.map((m) => (
                <Pressable
                  key={m.mode}
                  style={[styles.modeChip, travelMode === m.mode && styles.modeChipActive]}
                  onPress={() => setTravelMode(m.mode)}
                >
                  <Feather name={m.icon as any} size={15} color={travelMode === m.mode ? colors.white : colors.neutralDarkMedium} />
                  <Text style={[styles.modeChipText, travelMode === m.mode && styles.modeChipTextActive]}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.routeSummary}>
              {routeLoading
                ? "Routing…"
                : routeInfo
                ? `${formatDistance(routeInfo.distanceMeters)} · ${formatDuration(routeInfo.durationSeconds)}`
                : from && to
                ? "No route found"
                : `Set the ${active === "to" ? "destination" : "start"} — tap the map or search`}
            </Text>
          </View>
        ) : (
          <View style={[styles.hintBar, { bottom: insets.bottom + spacing.lg }]}>
            <Feather name="info" size={13} color={colors.white} />
            <Text style={styles.hintText}>Tap the map or search to drop a pin</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  card: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cancel: { ...typography.actionM, color: colors.textMuted },
  save: { ...typography.actionM, color: colors.primary },
  saveDisabled: { color: colors.neutralLightDark },
  dirToggle: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm },
  dirToggleText: { ...typography.actionM, color: colors.primary },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  inputRowActive: { borderColor: colors.primary },
  numBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  numBadgeText: { color: colors.white, fontWeight: "700", fontSize: 12 },
  singleDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  input: { flex: 1, ...typography.bodyM, color: colors.neutralDarkDarkest, padding: 0 },
  divider: { height: spacing.xs },
  hintBar: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(31,32,36,0.85)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  hintText: { ...typography.bodyS, color: colors.white },
  bottomCard: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: "center",
  },
  modeRow: { flexDirection: "row", gap: spacing.sm },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  modeChipActive: { backgroundColor: colors.primary },
  modeChipText: { ...typography.actionM, color: colors.neutralDarkMedium },
  modeChipTextActive: { color: colors.white },
  routeSummary: { ...typography.bodyM, color: colors.neutralDarkDarkest, fontWeight: "700" },
});
