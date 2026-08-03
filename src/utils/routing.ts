import { ORS_API_KEY } from "../config";

// Routing via OpenRouteService. Kept behind this single function so the engine is swappable.
export type TravelMode = "driving-car" | "foot-walking" | "cycling-regular";
export type LatLng = [number, number]; // [lat, lng]
export type Coord = { lat: number; lng: number };
export type RouteResult = { coords: LatLng[]; distanceMeters: number; durationSeconds: number };

export const TRAVEL_MODES: { mode: TravelMode; label: string; icon: string }[] = [
  { mode: "driving-car", label: "Drive", icon: "truck" },
  { mode: "foot-walking", label: "Walk", icon: "user" },
  { mode: "cycling-regular", label: "Cycle", icon: "navigation" },
];

/** Fetch a road route + distance/duration. Returns null if no key or the request fails. */
export async function getRoute(
  origin: Coord,
  dest: Coord,
  mode: TravelMode
): Promise<RouteResult | null> {
  if (!ORS_API_KEY) return null;
  try {
    const url =
      `https://api.openrouteservice.org/v2/directions/${mode}` +
      `?api_key=${ORS_API_KEY}&start=${origin.lng},${origin.lat}&end=${dest.lng},${dest.lat}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const feat = data?.features?.[0];
    if (!feat?.geometry?.coordinates) return null;
    const coords = (feat.geometry.coordinates as [number, number][]).map(
      ([lng, lat]) => [lat, lng] as LatLng
    );
    const summary = feat.properties?.summary ?? {};
    return {
      coords,
      distanceMeters: summary.distance ?? 0,
      durationSeconds: summary.duration ?? 0,
    };
  } catch {
    return null;
  }
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function formatDuration(s: number): string {
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
