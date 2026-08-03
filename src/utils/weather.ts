// Weather via open-meteo (free, no key). Forecast only covers ~16 days ahead, so far-future
// or past events simply return null (no card shown).
export type DailyWeather = {
  date: string;
  code: number;
  tMax: number;
  tMin: number;
  precip: number; // max precipitation probability %
};

export async function fetchWeather(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string
): Promise<DailyWeather[] | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&start_date=${startDate}&end_date=${endDate}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    const daily = d?.daily;
    if (!daily?.time?.length) return null;
    return daily.time.map((date: string, i: number) => ({
      date,
      code: daily.weather_code?.[i] ?? 0,
      tMax: daily.temperature_2m_max?.[i] ?? 0,
      tMin: daily.temperature_2m_min?.[i] ?? 0,
      precip: daily.precipitation_probability_max?.[i] ?? 0,
    }));
  } catch {
    return null;
  }
}

// WMO weather code → a short label + a Feather icon name.
export function weatherLabel(code: number): { label: string; icon: string } {
  if (code === 0) return { label: "Clear", icon: "sun" };
  if (code === 1 || code === 2) return { label: "Partly cloudy", icon: "cloud" };
  if (code === 3) return { label: "Overcast", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "Fog", icon: "cloud" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", icon: "cloud-drizzle" };
  if (code >= 61 && code <= 67) return { label: "Rain", icon: "cloud-rain" };
  if (code >= 71 && code <= 77) return { label: "Snow", icon: "cloud-snow" };
  if (code >= 80 && code <= 82) return { label: "Rain showers", icon: "cloud-rain" };
  if (code === 85 || code === 86) return { label: "Snow showers", icon: "cloud-snow" };
  if (code >= 95) return { label: "Thunderstorm", icon: "cloud-lightning" };
  return { label: "—", icon: "cloud" };
}
