import { WorldViewManager } from "../wsManager";

const OPENSKY_URL = "https://opensky-network.org/api/states/all";
const POLL_INTERVAL = 30_000; // 30 seconds

interface AircraftState {
  id: string;
  callsign: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  heading: number | null;
  velocity: number | null;
  verticalRate: number | null;
  onGround: boolean;
  category: number;
  trail: number[][];
  last_seen: string;
  source: string;
}

const aircraftTrails = new Map<string, number[][]>();
let cachedPayload: AircraftState[] = [];
let demoModeLogged = false;

function buildDemoPayload(): AircraftState[] {
  const now = new Date().toISOString();
  const demoFlights = [
    { id: "demo001", callsign: "UAL123", country: "United States", lat: 40.7, lon: -74.0, alt: 10000, hdg: 90 },
    { id: "demo002", callsign: "BAW456", country: "United Kingdom", lat: 51.5, lon: -0.1, alt: 11000, hdg: 270 },
    { id: "demo003", callsign: "DLH789", country: "Germany", lat: 52.5, lon: 13.4, alt: 9500, hdg: 180 },
    { id: "demo004", callsign: "AFR101", country: "France", lat: 48.9, lon: 2.3, alt: 10500, hdg: 45 },
    { id: "demo005", callsign: "JAL202", country: "Japan", lat: 35.7, lon: 139.7, alt: 11500, hdg: 315 },
    { id: "demo006", callsign: "SIA303", country: "Singapore", lat: 1.4, lon: 103.8, alt: 10800, hdg: 200 },
    { id: "demo007", callsign: "QFA404", country: "Australia", lat: -33.9, lon: 151.2, alt: 9800, hdg: 120 },
    { id: "demo008", callsign: "EZY505", country: "United Kingdom", lat: 53.4, lon: -2.2, alt: 8500, hdg: 60 },
    { id: "demo009", callsign: "THY606", country: "Turkey", lat: 41.0, lon: 28.9, alt: 10200, hdg: 150 },
    { id: "demo010", callsign: "EK707", country: "United Arab Emirates", lat: 25.2, lon: 55.4, alt: 11200, hdg: 330 },
  ];
  return demoFlights.map(f => ({
    id: f.id,
    callsign: f.callsign,
    country: f.country,
    latitude: f.lat + (Math.random() - 0.5) * 0.5,
    longitude: f.lon + (Math.random() - 0.5) * 0.5,
    altitude: f.alt,
    heading: f.hdg,
    velocity: 200 + Math.random() * 300,
    verticalRate: (Math.random() - 0.5) * 10,
    onGround: false,
    category: 1,
    trail: [],
    last_seen: now,
    source: "demo",
  }));
}

async function fetchOpenSkyStates(): Promise<AircraftState[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(OPENSKY_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "worldview-app/1.0" },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`);
    const data = await res.json() as { states?: unknown[][] };
    const states = data.states ?? [];
    const now = new Date().toISOString();
    const payload: AircraftState[] = [];
    for (const state of states) {
      if (!Array.isArray(state)) continue;
      const icao = String(state[0] ?? "").trim();
      const lat = typeof state[6] === "number" ? state[6] : null;
      const lon = typeof state[5] === "number" ? state[5] : null;
      if (!icao || lat === null || lon === null) continue;
      const pos: number[] = [lon, lat, typeof state[7] === "number" ? state[7] : 0];
      const existing = aircraftTrails.get(icao) ?? [];
      const trail = [...existing, pos].slice(-30);
      aircraftTrails.set(icao, trail);
      payload.push({
        id: icao,
        callsign: String(state[1] ?? "").trim() || icao,
        country: String(state[2] ?? ""),
        latitude: lat,
        longitude: lon,
        altitude: typeof state[7] === "number" ? state[7] : null,
        heading: typeof state[10] === "number" ? state[10] : null,
        velocity: typeof state[9] === "number" ? state[9] : null,
        verticalRate: typeof state[11] === "number" ? state[11] : null,
        onGround: Boolean(state[8]),
        category: typeof state[17] === "number" ? state[17] : 0,
        trail,
        last_seen: now,
        source: "opensky",
      });
    }
    return payload;
  } catch {
    return [];
  }
}

export async function startFlightWorker(manager: WorldViewManager): Promise<void> {
  const poll = async () => {
    let payload = await fetchOpenSkyStates();
    let status: "live" | "degraded" | "fallback" = "live";
    let detail = `OpenSky returned ${payload.length} aircraft`;

    if (payload.length > 0) {
      cachedPayload = payload;
      demoModeLogged = false;
    } else if (cachedPayload.length > 0) {
      payload = cachedPayload;
      status = "degraded";
      detail = "Using cached aircraft data";
    } else {
      payload = buildDemoPayload();
      cachedPayload = payload;
      status = "fallback";
      detail = "Using simulated aircraft (OpenSky unavailable)";
      if (!demoModeLogged) {
        console.warn("[FlightWorker] Broadcasting demo aircraft payload");
        demoModeLogged = true;
      }
    }

    manager.broadcast("aircraft_updates", payload);
    manager.updateFeedStatus("aircraft", {
      status,
      detail,
      itemCount: payload.length,
    });
  };

  // Initial poll
  await poll();
  setInterval(poll, POLL_INTERVAL);
}
