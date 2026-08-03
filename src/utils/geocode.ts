// Geocoding via OpenStreetMap Nominatim (free, no key). Fair-use: max ~1 req/sec and a
// descriptive User-Agent — fine for a single-user app.
const BASE = "https://nominatim.openstreetmap.org";
const HEADERS = { "User-Agent": "Routinely/1.0 (personal on-device app)", "Accept-Language": "en" };

export type GeoResult = { lat: number; lng: number; name: string };

/** Forward search — returns up to 5 candidate places for a free-text query. */
export async function searchPlace(query: string): Promise<GeoResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const url = `${BASE}/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=0`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    return data.map((r) => ({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), name: r.display_name }));
  } catch {
    return [];
  }
}

/** Reverse geocode a tapped coordinate to a human-readable name (or null). */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${BASE}/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

/** Build a shareable OSM URL for a coordinate. */
export function osmUrlFor(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}
