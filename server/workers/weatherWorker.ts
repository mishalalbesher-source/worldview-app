import { WorldViewManager } from "../wsManager";

const RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const NWS_ALERTS_URL = "https://api.weather.gov/alerts/active?status=actual&message_type=alert&limit=12";
const POLL_INTERVAL = 300_000; // 5 minutes

const WEATHER_CITIES = [
  { id: "new_york", name: "New York", region: "North America", latitude: 40.7128, longitude: -74.006 },
  { id: "london", name: "London", region: "Europe", latitude: 51.5072, longitude: -0.1276 },
  { id: "tokyo", name: "Tokyo", region: "Asia Pacific", latitude: 35.6762, longitude: 139.6503 },
  { id: "sydney", name: "Sydney", region: "Asia Pacific", latitude: -33.8688, longitude: 151.2093 },
  { id: "dubai", name: "Dubai", region: "Middle East", latitude: 25.2048, longitude: 55.2708 },
  { id: "singapore", name: "Singapore", region: "Asia Pacific", latitude: 1.3521, longitude: 103.8198 },
  { id: "paris", name: "Paris", region: "Europe", latitude: 48.8566, longitude: 2.3522 },
  { id: "sao_paulo", name: "São Paulo", region: "South America", latitude: -23.5505, longitude: -46.6333 },
];

const WEATHER_CODE_LABELS: Record<number, string> = {
  0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow",
  80: "Rain showers", 81: "Showers", 82: "Violent showers", 95: "Thunderstorm",
};

async function fetchRadarOverlay() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(RAINVIEWER_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`RainViewer HTTP ${res.status}`);
    const payload = await res.json() as { host?: string; radar?: { past?: { path: string; time: number }[] } };
    const host = payload.host;
    const frames = payload.radar?.past ?? [];
    const latest = frames[frames.length - 1];
    if (!host || !latest) throw new Error("No radar frames");
    return {
      tileTemplate: `${host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`,
      frameTime: latest.time,
      opacity: 0.55,
      source: "RainViewer",
      layerName: "radar",
      coverage: "global",
      maximumLevel: 7,
    };
  } catch {
    return {
      tileTemplate: null,
      frameTime: null,
      opacity: 0,
      source: "Unavailable",
      layerName: "radar",
      coverage: "none",
      maximumLevel: 0,
    };
  }
}

async function fetchWeatherSummaries() {
  try {
    const lats = WEATHER_CITIES.map(c => c.latitude).join(",");
    const lons = WEATHER_CITIES.map(c => c.longitude).join(",");
    const url = `${OPEN_METEO_URL}?latitude=${lats}&longitude=${lons}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation,is_day&timezone=UTC`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = await res.json() as unknown;
    const arr = Array.isArray(data) ? data : [data];
    return WEATHER_CITIES.map((city, i) => {
      const item = arr[i] as Record<string, unknown> ?? {};
      const current = item.current as Record<string, unknown> ?? {};
      const units = item.current_units as Record<string, unknown> ?? {};
      const code = current.weather_code as number | undefined;
      return {
        id: city.id,
        name: city.name,
        region: city.region,
        latitude: city.latitude,
        longitude: city.longitude,
        temperature: current.temperature_2m as number | undefined,
        feelsLike: current.apparent_temperature as number | undefined,
        weatherCode: code,
        condition: code !== undefined ? (WEATHER_CODE_LABELS[code] ?? `WMO ${code}`) : "Unknown",
        windSpeed: current.wind_speed_10m as number | undefined,
        windDirection: current.wind_direction_10m as number | undefined,
        cloudCover: current.cloud_cover as number | undefined,
        precipitation: current.precipitation as number | undefined,
        isDay: Boolean(current.is_day),
        observedAt: current.time as string | undefined,
        units: {
          temperature: units.temperature_2m ?? "°C",
          windSpeed: units.wind_speed_10m ?? "km/h",
          precipitation: units.precipitation ?? "mm",
        },
        source: "Open-Meteo",
      };
    });
  } catch {
    return [];
  }
}

async function fetchWeatherAlerts() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(NWS_ALERTS_URL, {
      signal: controller.signal,
      headers: { Accept: "application/geo+json", "User-Agent": "worldview-app/1.0" },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`NWS HTTP ${res.status}`);
    const payload = await res.json() as { features?: unknown[] };
    const features = payload.features ?? [];
    const alerts = [];
    for (const feature of features) {
      const f = feature as Record<string, unknown>;
      const props = f.properties as Record<string, unknown> ?? {};
      const event = (props.event as string) ?? "Weather Alert";
      const headline = (props.headline as string) ?? (props.description as string) ?? "";
      if (event.toLowerCase().includes("test") || headline.toLowerCase().includes("keepalive")) continue;
      alerts.push({
        id: (props.id as string) ?? String(alerts.length),
        event,
        headline,
        severity: (props.severity as string) ?? "Unknown",
        urgency: (props.urgency as string) ?? "Unknown",
        area: (props.areaDesc as string) ?? "United States",
        effective: props.effective as string | undefined,
        expires: props.expires as string | undefined,
        instruction: (props.instruction as string) ?? "",
        source: "api.weather.gov",
        url: props["@id"] as string | undefined,
      });
      if (alerts.length >= 12) break;
    }
    return alerts;
  } catch {
    return [];
  }
}

export async function startWeatherWorker(manager: WorldViewManager): Promise<void> {
  const poll = async () => {
    const [radarConfig, summaries, alerts] = await Promise.all([
      fetchRadarOverlay(),
      fetchWeatherSummaries(),
      fetchWeatherAlerts(),
    ]);

    manager.broadcast("weather_config", radarConfig);
    manager.broadcast("weather_summary", summaries);
    manager.broadcast("weather_alerts", alerts);
    manager.updateFeedStatus("weather", {
      status: radarConfig.source !== "Unavailable" ? "live" : "fallback",
      detail: `Radar: ${radarConfig.source}, ${summaries.length} city summaries, ${alerts.length} alerts`,
      itemCount: summaries.length,
    });
  };

  await poll();
  setInterval(poll, POLL_INTERVAL);
}
