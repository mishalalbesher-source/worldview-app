import { WorldViewManager } from "../wsManager";
// @ts-ignore - satellite.js types
import * as satellite from "satellite.js";

const POLL_INTERVAL = 18_000; // 18 seconds
const TLE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface TrackedSatellite {
  catnr: string;
  id: string;
  name: string;
  category: string;
}

const TRACKED_SATELLITES: TrackedSatellite[] = [
  { catnr: "25544", id: "iss", name: "ISS (ZARYA)", category: "Human Spaceflight" },
  { catnr: "48274", id: "tianhe", name: "CSS (TIANHE)", category: "Human Spaceflight" },
  { catnr: "20580", id: "hubble", name: "HST", category: "Science" },
  { catnr: "33053", id: "fermi", name: "FGRST (GLAST)", category: "Science" },
  { catnr: "36508", id: "cryosat2", name: "CRYOSAT 2", category: "Science" },
  { catnr: "28054", id: "dmsp_f16", name: "DMSP 5D-3 F16", category: "Weather" },
  { catnr: "37849", id: "suomi_npp", name: "SUOMI NPP", category: "Weather" },
  { catnr: "41866", id: "goes16", name: "GOES 16", category: "Weather" },
  { catnr: "43013", id: "noaa20", name: "NOAA 20", category: "Weather" },
  { catnr: "40267", id: "himawari8", name: "HIMAWARI-8", category: "Weather" },
  { catnr: "24876", id: "gps_prn13", name: "GPS BIIR-2 (PRN 13)", category: "Navigation" },
  { catnr: "26407", id: "gps_prn22", name: "GPS BIIR-5 (PRN 22)", category: "Navigation" },
  { catnr: "27663", id: "gps_prn16", name: "GPS BIIR-8 (PRN 16)", category: "Navigation" },
  { catnr: "25994", id: "terra", name: "TERRA", category: "Earth Observation" },
  { catnr: "27424", id: "aqua", name: "AQUA", category: "Earth Observation" },
  { catnr: "39084", id: "landsat8", name: "LANDSAT 8", category: "Earth Observation" },
  { catnr: "40697", id: "sentinel2a", name: "SENTINEL-2A", category: "Earth Observation" },
  { catnr: "42063", id: "sentinel2b", name: "SENTINEL-2B", category: "Earth Observation" },
];

interface TLERecord {
  line1: string;
  line2: string;
  fetchedAt: number;
}

const tleCache = new Map<string, TLERecord>();

async function fetchTLE(catnr: string): Promise<{ line1: string; line2: string } | null> {
  const cached = tleCache.get(catnr);
  if (cached && Date.now() - cached.fetchedAt < TLE_CACHE_TTL) {
    return { line1: cached.line1, line2: cached.line2 };
  }
  try {
    const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=tle`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "worldview-app/1.0" },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Celestrak HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) throw new Error("Invalid TLE format");
    const line1 = lines[1];
    const line2 = lines[2];
    tleCache.set(catnr, { line1, line2, fetchedAt: Date.now() });
    return { line1, line2 };
  } catch {
    return null;
  }
}

function computePosition(line1: string, line2: string): { lat: number; lon: number; alt: number; orbit: number[][] } | null {
  try {
    const satrec = satellite.twoline2satrec(line1, line2);
    const now = new Date();
    const posVel = satellite.propagate(satrec, now) as { position: { x: number; y: number; z: number } | boolean };
    if (!posVel || !posVel.position || typeof posVel.position === "boolean") return null;
    const gmst = satellite.gstime(now);
    const geo = satellite.eciToGeodetic(posVel.position as { x: number; y: number; z: number }, gmst);
    const lat = satellite.degreesLat(geo.latitude);
    const lon = satellite.degreesLong(geo.longitude);
    const alt = geo.height * 1000; // km to meters

    // Compute orbit track (next 90 min, every 5 min)
    const orbit: number[][] = [];
    for (let i = 0; i <= 18; i++) {
      const t = new Date(now.getTime() + i * 5 * 60 * 1000);
      const pv = satellite.propagate(satrec, t) as { position: { x: number; y: number; z: number } | boolean } | null;
      if (!pv || !pv.position || typeof pv.position === "boolean") continue;
      const g = satellite.gstime(t);
      const geo2 = satellite.eciToGeodetic(pv.position as { x: number; y: number; z: number }, g);
      orbit.push([
        satellite.degreesLong(geo2.longitude),
        satellite.degreesLat(geo2.latitude),
        geo2.height * 1000,
      ]);
    }

    return { lat, lon, alt, orbit };
  } catch {
    return null;
  }
}

function buildFallbackPosition(sat: TrackedSatellite, index: number): { lat: number; lon: number; alt: number; orbit: number[][] } {
  const t = Date.now() / 1000;
  const period = 90 * 60; // 90 min orbit
  const phase = (index / TRACKED_SATELLITES.length) * 2 * Math.PI;
  const lon = ((t / period * 360 + (phase * 180 / Math.PI)) % 360) - 180;
  const inclination = sat.category === "Navigation" ? 55 : 51.6;
  const lat = Math.sin(t / period * 2 * Math.PI + phase) * inclination;
  const alt = sat.category === "Navigation" ? 20_180_000 : 408_000;
  return { lat, lon, alt, orbit: [] };
}

export async function startSatelliteWorker(manager: WorldViewManager): Promise<void> {
  const poll = async () => {
    const results = [];
    let successCount = 0;

    for (let i = 0; i < TRACKED_SATELLITES.length; i++) {
      const sat = TRACKED_SATELLITES[i];
      const tle = await fetchTLE(sat.catnr);
      let pos: { lat: number; lon: number; alt: number; orbit: number[][] };

      if (tle) {
        const computed = computePosition(tle.line1, tle.line2);
        if (computed) {
          pos = computed;
          successCount++;
        } else {
          pos = buildFallbackPosition(sat, i);
        }
      } else {
        pos = buildFallbackPosition(sat, i);
      }

      results.push({
        id: sat.id,
        name: sat.name,
        category: sat.category,
        latitude: pos.lat,
        longitude: pos.lon,
        altitude: pos.alt,
        orbit: pos.orbit,
        source: tle ? "celestrak" : "fallback",
      });
    }

    manager.broadcast("satellite_updates", results);
    manager.updateFeedStatus("satellites", {
      status: successCount > 0 ? "live" : "fallback",
      detail: `${successCount}/${TRACKED_SATELLITES.length} satellites with live TLE data`,
      itemCount: results.length,
    });
  };

  await poll();
  setInterval(poll, POLL_INTERVAL);
}
