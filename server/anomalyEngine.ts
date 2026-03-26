/**
 * Anomaly Detection Engine
 *
 * Detects unusual behaviour across all tracked domains:
 *
 * Aircraft anomalies:
 *   - Sudden disappearance (was tracked, now gone for >5 min)
 *   - Abnormal altitude drop (>1500 ft/min descent outside approach)
 *   - Squawk 7500/7600/7700 (hijack/radio failure/emergency) — via callsign heuristic
 *   - Dense clustering (>20 aircraft within 50km radius)
 *
 * Maritime anomalies:
 *   - AIS dark event (vessel stops transmitting mid-ocean)
 *   - Abnormal speed (>30 knots for non-HSC vessel)
 *   - Vessel in restricted zone (placeholder — extendable)
 *
 * Earthquake anomalies:
 *   - M5.0+ event (significant earthquake alert)
 *   - Tsunami warning flag
 */

export type AnomalySeverity = "info" | "warning" | "critical";
export type AnomalyDomain = "aircraft" | "maritime" | "earthquake" | "satellite";

export interface Anomaly {
  id: string;
  domain: AnomalyDomain;
  severity: AnomalySeverity;
  type: string;
  title: string;
  description: string;
  entityId: string;
  entityName: string;
  latitude: number | null;
  longitude: number | null;
  detectedAt: string;
  acknowledged: boolean;
  metadata: Record<string, unknown>;
}

// ─── Internal tracking state ──────────────────────────────────────────────────

interface TrackedAircraft {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  alt: number | null;
  verticalRate: number | null;
  lastSeen: number;
  country: string;
}

interface TrackedVessel {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  speed: number | null;
  typeCategory: string;
  lastSeen: number;
}

const MAX_ANOMALIES = 100;
const AIRCRAFT_DISAPPEAR_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const VESSEL_DARK_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes
const DESCENT_RATE_THRESHOLD = -20; // m/s (≈ -4000 ft/min) — only flag truly abnormal descents
const VESSEL_SPEED_THRESHOLD = 30; // knots
const CLUSTER_RADIUS_DEG = 0.5; // ~55km
const CLUSTER_COUNT_THRESHOLD = 25;

let trackedAircraft = new Map<string, TrackedAircraft>();
let trackedVessels = new Map<string, TrackedVessel>();
let anomalies: Anomaly[] = [];
let anomalyIdCounter = 0;

function generateId(): string {
  return `anom_${Date.now()}_${++anomalyIdCounter}`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function addAnomaly(anomaly: Omit<Anomaly, "id" | "detectedAt" | "acknowledged">): Anomaly {
  const full: Anomaly = {
    ...anomaly,
    id: generateId(),
    detectedAt: new Date().toISOString(),
    acknowledged: false,
  };
  anomalies.unshift(full);
  if (anomalies.length > MAX_ANOMALIES) {
    anomalies = anomalies.slice(0, MAX_ANOMALIES);
  }
  return full;
}

function isDuplicate(domain: AnomalyDomain, type: string, entityId: string, windowMs = 10 * 60 * 1000): boolean {
  const cutoff = Date.now() - windowMs;
  return anomalies.some(a =>
    a.domain === domain &&
    a.type === type &&
    a.entityId === entityId &&
    new Date(a.detectedAt).getTime() > cutoff
  );
}

// ─── Aircraft analysis ────────────────────────────────────────────────────────

interface AircraftInput {
  id: string;
  callsign: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  verticalRate: number | null;
  onGround: boolean;
  country: string;
}

export function analyzeAircraft(aircraft: AircraftInput[]): Anomaly[] {
  const now = Date.now();
  const newAnomalies: Anomaly[] = [];
  const currentIds = new Set<string>();

  for (const ac of aircraft) {
    if (ac.latitude === null || ac.longitude === null) continue;
    currentIds.add(ac.id);

    const prev = trackedAircraft.get(ac.id);

    // Update tracking
    trackedAircraft.set(ac.id, {
      id: ac.id,
      callsign: ac.callsign,
      lat: ac.latitude,
      lon: ac.longitude,
      alt: ac.altitude,
      verticalRate: ac.verticalRate,
      lastSeen: now,
      country: ac.country,
    });

    // Anomaly: rapid descent (not on ground, not already flagged)
    if (
      !ac.onGround &&
      ac.verticalRate !== null &&
      ac.verticalRate < DESCENT_RATE_THRESHOLD &&
      ac.altitude !== null &&
      ac.altitude > 3000 &&  // Only flag high-altitude rapid descents (not normal approach)
      !isDuplicate("aircraft", "rapid_descent", ac.id, 15 * 60 * 1000) // 15 min dedup window
    ) {
      const a = addAnomaly({
        domain: "aircraft",
        severity: ac.verticalRate < -20 ? "critical" : "warning",
        type: "rapid_descent",
        title: "Rapid Descent Detected",
        description: `${ac.callsign || ac.id} descending at ${Math.abs(ac.verticalRate).toFixed(1)} m/s (${Math.abs(ac.verticalRate * 196.85).toFixed(0)} ft/min) at ${((ac.altitude ?? 0) / 1000).toFixed(1)} km altitude`,
        entityId: ac.id,
        entityName: ac.callsign || ac.id,
        latitude: ac.latitude,
        longitude: ac.longitude,
        metadata: { verticalRate: ac.verticalRate, altitude: ac.altitude },
      });
      newAnomalies.push(a);
    }

    // Anomaly: emergency squawk heuristic (callsign contains MAYDAY, EMERGENCY, or 7700)
    if (
      (ac.callsign.includes("7700") || ac.callsign.includes("7600") || ac.callsign.includes("7500") ||
       ac.callsign.toUpperCase().includes("MAYDAY") || ac.callsign.toUpperCase().includes("EMRG")) &&
      !isDuplicate("aircraft", "emergency_squawk", ac.id)
    ) {
      const squawkType = ac.callsign.includes("7500") ? "Hijack" :
                         ac.callsign.includes("7600") ? "Radio Failure" : "Emergency";
      const a = addAnomaly({
        domain: "aircraft",
        severity: "critical",
        type: "emergency_squawk",
        title: `${squawkType} Squawk`,
        description: `${ac.callsign || ac.id} is broadcasting ${squawkType.toLowerCase()} signal`,
        entityId: ac.id,
        entityName: ac.callsign || ac.id,
        latitude: ac.latitude,
        longitude: ac.longitude,
        metadata: { callsign: ac.callsign },
      });
      newAnomalies.push(a);
    }

    void prev; // suppress unused warning
  }

  // Anomaly: aircraft disappearance
  for (const [id, tracked] of Array.from(trackedAircraft.entries())) {
    if (!currentIds.has(id) && now - tracked.lastSeen > AIRCRAFT_DISAPPEAR_THRESHOLD_MS) {
      if (!isDuplicate("aircraft", "track_lost", id)) {
        const a = addAnomaly({
          domain: "aircraft",
          severity: "info",
          type: "track_lost",
          title: "Track Lost",
          description: `${tracked.callsign || id} (${tracked.country}) disappeared from tracking — last seen at ${(tracked.alt ?? 0 / 1000).toFixed(1)} km`,
          entityId: id,
          entityName: tracked.callsign || id,
          latitude: tracked.lat,
          longitude: tracked.lon,
          metadata: { lastAlt: tracked.alt, country: tracked.country },
        });
        newAnomalies.push(a);
      }
      trackedAircraft.delete(id);
    }
  }

  // Anomaly: dense clustering
  const acList = Array.from(trackedAircraft.values());
  for (const ac of acList) {
    const nearby = acList.filter(other =>
      other.id !== ac.id &&
      Math.abs(other.lat - ac.lat) < CLUSTER_RADIUS_DEG &&
      Math.abs(other.lon - ac.lon) < CLUSTER_RADIUS_DEG &&
      haversineKm(ac.lat, ac.lon, other.lat, other.lon) < 55
    );
    if (nearby.length >= CLUSTER_COUNT_THRESHOLD && !isDuplicate("aircraft", "dense_cluster", ac.id, 30 * 60 * 1000)) {
      const a = addAnomaly({
        domain: "aircraft",
        severity: "info",
        type: "dense_cluster",
        title: "Dense Air Traffic Cluster",
        description: `${nearby.length + 1} aircraft within 55km radius near ${ac.lat.toFixed(1)}°, ${ac.lon.toFixed(1)}°`,
        entityId: ac.id,
        entityName: `Cluster near ${ac.lat.toFixed(1)}°N ${ac.lon.toFixed(1)}°E`,
        latitude: ac.lat,
        longitude: ac.lon,
        metadata: { count: nearby.length + 1 },
      });
      newAnomalies.push(a);
    }
  }

  return newAnomalies;
}

// ─── Maritime analysis ────────────────────────────────────────────────────────

interface VesselInput {
  mmsi: string;
  name: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  typeCategory: string;
}

export function analyzeVessels(vessels: VesselInput[]): Anomaly[] {
  const now = Date.now();
  const newAnomalies: Anomaly[] = [];
  const currentMMSIs = new Set<string>();

  for (const v of vessels) {
    currentMMSIs.add(v.mmsi);
    trackedVessels.set(v.mmsi, {
      mmsi: v.mmsi,
      name: v.name,
      lat: v.latitude,
      lon: v.longitude,
      speed: v.speed,
      typeCategory: v.typeCategory,
      lastSeen: now,
    });

    // Anomaly: abnormal speed for non-HSC vessel
    if (
      v.speed !== null &&
      v.speed > VESSEL_SPEED_THRESHOLD &&
      v.typeCategory !== "sar" && // SAR vessels can be fast
      !isDuplicate("maritime", "abnormal_speed", v.mmsi, 15 * 60 * 1000)
    ) {
      const a = addAnomaly({
        domain: "maritime",
        severity: "warning",
        type: "abnormal_speed",
        title: "Abnormal Vessel Speed",
        description: `${v.name || v.mmsi} (${v.typeCategory}) travelling at ${v.speed.toFixed(1)} knots — unusually high for vessel type`,
        entityId: v.mmsi,
        entityName: v.name || v.mmsi,
        latitude: v.latitude,
        longitude: v.longitude,
        metadata: { speed: v.speed, typeCategory: v.typeCategory },
      });
      newAnomalies.push(a);
    }
  }

  // Anomaly: AIS dark event
  for (const [mmsi, tracked] of Array.from(trackedVessels.entries())) {
    if (!currentMMSIs.has(mmsi) && now - tracked.lastSeen > VESSEL_DARK_THRESHOLD_MS) {
      if (!isDuplicate("maritime", "ais_dark", mmsi)) {
        const a = addAnomaly({
          domain: "maritime",
          severity: "warning",
          type: "ais_dark",
          title: "AIS Dark Event",
          description: `${tracked.name || mmsi} (${tracked.typeCategory}) stopped transmitting — last position ${tracked.lat.toFixed(2)}°, ${tracked.lon.toFixed(2)}°`,
          entityId: mmsi,
          entityName: tracked.name || mmsi,
          latitude: tracked.lat,
          longitude: tracked.lon,
          metadata: { typeCategory: tracked.typeCategory },
        });
        newAnomalies.push(a);
      }
      trackedVessels.delete(mmsi);
    }
  }

  return newAnomalies;
}

// ─── Earthquake analysis ──────────────────────────────────────────────────────

interface EarthquakeInput {
  id: string;
  place: string;
  magnitude: number;
  latitude: number;
  longitude: number;
  tsunami: boolean;
  time: string | null;
}

export function analyzeEarthquakes(earthquakes: EarthquakeInput[]): Anomaly[] {
  const newAnomalies: Anomaly[] = [];

  for (const eq of earthquakes) {
    // Significant earthquake (M5+)
    if (eq.magnitude >= 5.0 && !isDuplicate("earthquake", "significant_quake", eq.id)) {
      const severity: AnomalySeverity = eq.magnitude >= 7.0 ? "critical" : eq.magnitude >= 6.0 ? "warning" : "info";
      const a = addAnomaly({
        domain: "earthquake",
        severity,
        type: "significant_quake",
        title: `M${eq.magnitude.toFixed(1)} Earthquake`,
        description: `${eq.place} — Magnitude ${eq.magnitude.toFixed(1)}${eq.tsunami ? " ⚠ TSUNAMI WARNING" : ""}`,
        entityId: eq.id,
        entityName: eq.place,
        latitude: eq.latitude,
        longitude: eq.longitude,
        metadata: { magnitude: eq.magnitude, tsunami: eq.tsunami, time: eq.time },
      });
      newAnomalies.push(a);
    }

    // Tsunami warning
    if (eq.tsunami && !isDuplicate("earthquake", "tsunami_warning", eq.id)) {
      const a = addAnomaly({
        domain: "earthquake",
        severity: "critical",
        type: "tsunami_warning",
        title: "TSUNAMI WARNING",
        description: `Tsunami warning issued following M${eq.magnitude.toFixed(1)} earthquake at ${eq.place}`,
        entityId: eq.id,
        entityName: eq.place,
        latitude: eq.latitude,
        longitude: eq.longitude,
        metadata: { magnitude: eq.magnitude, time: eq.time },
      });
      newAnomalies.push(a);
    }
  }

  return newAnomalies;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getAnomalies(): Anomaly[] {
  return anomalies;
}

export function acknowledgeAnomaly(id: string): boolean {
  const a = anomalies.find(x => x.id === id);
  if (a) { a.acknowledged = true; return true; }
  return false;
}

export function clearAcknowledged(): void {
  anomalies = anomalies.filter(a => !a.acknowledged);
}
