import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { radius, colors } from "../constants/theme";

type LatLng = [number, number];

type Props = {
  lat: number;
  lng: number;
  /** Optional route polyline (list of [lat,lng]); when set, the map fits the whole route. */
  route?: LatLng[];
  height?: number;
  /** When false, no border radius (e.g. flush inside a card that clips its own corners). */
  rounded?: boolean;
};

function buildHtml(lat: number, lng: number, route?: LatLng[]): string {
  const dot = (la: number, ln: number) =>
    `L.circleMarker([${la},${ln}],{radius:8,color:'#fff',weight:2,fillColor:'#006FFD',fillOpacity:1}).addTo(map);`;
  const frame =
    route && route.length > 1
      ? `var line=L.polyline(${JSON.stringify(route)},{color:'#006FFD',weight:5,opacity:0.9}).addTo(map);
         ${dot(route[0][0], route[0][1])}${dot(route[route.length - 1][0], route[route.length - 1][1])}
         function FIT(){ try{ map.fitBounds(line.getBounds().pad(0.18)); }catch(e){} }`
      : `${dot(lat, lng)} function FIT(){ map.setView([${lat},${lng}],15); }`;
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0;padding:0;background:#eef1f5}.leaflet-control-attribution{font-size:8px}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map=L.map('map',{zoomControl:false,attributionControl:true,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,tap:false,keyboard:false}).setView([${lat},${lng}],14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(map);
  ${frame}
  // Defer framing until the container has a measured size (fixes the zoomed-out/blank map).
  setTimeout(function(){ map.invalidateSize(); FIT(); }, 90);
  true;
</script></body></html>`;
}

export default function MapPreview({ lat, lng, route, height = 160, rounded = true }: Props) {
  return (
    <View style={[styles.wrap, { height }, rounded && styles.rounded]}>
      <WebView
        key={`${lat},${lng},${route?.length ?? 0}`}
        style={styles.web}
        originWhitelist={["*"]}
        source={{ html: buildHtml(lat, lng, route) }}
        javaScriptEnabled
        scrollEnabled={false}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", backgroundColor: colors.surfaceDark },
  rounded: { borderRadius: radius.lg },
  web: { flex: 1, backgroundColor: colors.surfaceDark },
});
