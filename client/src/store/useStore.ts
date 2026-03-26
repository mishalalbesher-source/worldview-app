import { create } from "zustand";

// ─── Aircraft Classification ──────────────────────────────────────────────────
// Based on ICAO hex ranges, callsign patterns, and OpenSky category field
export type AircraftClass = "military" | "civilian" | "unknown";
export type MilitarySubtype = "fighter" | "isr" | "transport" | "uav" | "helicopter" | "other";

export function classifyAircraft(icao24: string, callsign: string, country: string, category: number): AircraftClass {
  const id = icao24.toLowerCase();
  const cs = (callsign || "").toUpperCase();

  // OpenSky category 8 = military (when available)
  if (category === 8) return "military";

  // Known military callsign patterns
  const militaryCallsigns = /^(RCH|RCF|REACH|USAF|NAVY|ARMY|USMC|MARCE|EVAC|MEDEVAC|PAT|JAKE|SPAR|VENUS|BOXER|MAGMA|TOPAZ|IRON|STEEL|GHOST|SHADOW|EAGLE|HAWK|VIPER|RAVEN|FALCON|THUNDER|STORM|COBRA|WOLF|BEAR|TIGER|LION|DRAGON|KNIGHT|SWORD|LANCE|SHIELD|ARMOR|FORGE|ANVIL|HAMMER|BLADE|ARROW|SPEAR|DART|BOLT|FLASH|SPARK|FLAME|FIRE|SMOKE|DUST|SAND|ROCK|STONE|IRON|STEEL|BRASS|GOLD|SILVER|BRONZE|COPPER|ZINC|LEAD|CHROME|TITAN|ATLAS|ZEUS|THOR|ARES|MARS|APOLLO|ORION|PEGASUS|HERMES|MERCURY|SATURN|JUPITER|NEPTUNE|PLUTO|COMET|METEOR|NOVA|STAR|SUN|MOON|EARTH|ORBIT|COSMO|ASTRO|LUNA|SOLAR|GALAX|NEBULA|PULSAR|QUASAR|RADAR|SONAR|LASER|MASER|SONIC|ULTRA|HYPER|SUPER|MEGA|MACRO|MICRO|NANO|PICO|TERA|GIGA|KILO|MILLI|CENTI|DECI|HECTO)/;
  if (militaryCallsigns.test(cs)) return "military";

  // ICAO hex ranges for military aircraft (well-known ranges)
  // US Military: ADF7C0-ADFFFF, AE0000-AFFFFF
  if (id >= "ae0000" && id <= "afffff") return "military";
  // UK Military: 43C000-43FFFF
  if (id >= "43c000" && id <= "43ffff") return "military";
  // French Military: 3B0000-3BFFFF
  if (id >= "3b0000" && id <= "3bffff") return "military";
  // German Military: 3DC000-3DFFFF
  if (id >= "3dc000" && id <= "3dffff") return "military";
  // Russian Military: 0D0000-0DFFFF
  if (id >= "0d0000" && id <= "0dffff") return "military";
  // Chinese Military: 7B0000-7BFFFF
  if (id >= "7b0000" && id <= "7bffff") return "military";

  return "civilian";
}

export function getMilitarySubtype(callsign: string, icao24: string): MilitarySubtype {
  const cs = (callsign || "").toUpperCase();
  const id = icao24.toLowerCase();

  // ISR patterns (Reconnaissance/Surveillance)
  if (/^(JSTARS|AWACS|RIVET|COBRA|SENTRY|DRAGON|SHADOW|REAPER|GLOBAL|TRITON|POSEIDON|NEPTUNE|ORION|SENTINEL|GUARDIAN)/.test(cs)) return "isr";
  // UAV/Drone patterns
  if (/^(RQ|MQ|PRED|REAPER|GLOBAL|TRITON|SCAN|HERON|HERMES)/.test(cs)) return "uav";
  // Transport patterns
  if (/^(RCH|REACH|ATLAS|STARLIFTER|GALAXY|GLOBEMASTER|HERCULES|SPARTAN|CASA|TRANSALL)/.test(cs)) return "transport";
  // Helicopter patterns
  if (/^(DUSTOFF|MEDEVAC|PEDRO|JOLLY|PAVE|KNIFE|LIFEGUARD)/.test(cs)) return "helicopter";
  // Fighter/attack (default military if none above)
  if (id >= "ae0000" && id <= "afffff") return "fighter";
  return "other";
}

// ─── Ruler / Distance Measurement ────────────────────────────────────────────
export interface RulerPoint {
  longitude: number;
  latitude: number;
}

export type RulerUnit = "km" | "nm" | "mi";

export interface RulerState {
  active: boolean;
  points: RulerPoint[];
  unit: RulerUnit;
  totalDistance: number; // in km
  segmentDistances: number[]; // in km
}

// ─── Data Models ──────────────────────────────────────────────────────────────
export interface Aircraft {
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
  // Classification (derived client-side)
  aircraftClass?: AircraftClass;
  militarySubtype?: MilitarySubtype;
}

export interface Satellite {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  altitude: number;
  orbit: number[][];
  source: string;
}

export interface Earthquake {
  id: string;
  title: string;
  place: string;
  magnitude: number;
  depthKm: number;
  longitude: number;
  latitude: number;
  time: string | null;
  significance: number;
  tsunami: boolean;
  status: string;
  felt: number;
  url?: string;
  source: string;
}

export interface Webcam {
  id: string;
  name: string;
  park: string;
  region: string;
  type: string;
  latitude: number;
  longitude: number;
  viewerUrl: string;
  externalUrl: string;
  embedUrl: string;
  snapshotUrl: string;
  proxySnapshotUrl: string;
  refreshSeconds: number;
  source: string;
  availability: string;
  description: string;
}

export interface WeatherConfig {
  tileTemplate: string | null;
  frameTime: number | null;
  opacity: number;
  source: string;
  layerName: string;
  coverage: string;
  maximumLevel: number;
}

export interface WeatherSummary {
  id: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  temperature?: number;
  feelsLike?: number;
  weatherCode?: number;
  condition: string;
  windSpeed?: number;
  windDirection?: number;
  cloudCover?: number;
  precipitation?: number;
  isDay: boolean;
  observedAt?: string;
  units: { temperature: string; windSpeed: string; precipitation: string };
  source: string;
}

export interface WeatherAlert {
  id: string;
  event: string;
  headline: string;
  severity: string;
  urgency: string;
  area: string;
  effective?: string;
  expires?: string;
  instruction: string;
  source: string;
  url?: string;
}

export interface FeedStatus {
  source: string;
  status: "live" | "degraded" | "fallback" | "error" | "unknown";
  detail: string;
  itemCount: number;
  updatedAt: string;
}

export interface SelectedEntity {
  type: "aircraft" | "satellites" | "webcams" | "earthquakes" | "vessels";
  id: string;
}

// ─── Vessel / Maritime ────────────────────────────────────────────────────────
export type VesselCategory = "cargo" | "tanker" | "passenger" | "military" | "sar" | "fishing" | "pleasure" | "tug" | "other";

export interface Vessel {
  mmsi: string;
  name: string;
  callsign: string;
  flag: string;
  type: number;
  typeName: string;
  typeCategory: VesselCategory;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  course: number | null;
  status: number | null;
  statusName: string;
  destination: string;
  draught: number | null;
  length: number | null;
  width: number | null;
  trail: number[][];
  last_seen: string;
  source: string;
}

// ─── Anomaly ──────────────────────────────────────────────────────────────────
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

// ─── Timeline / Playback ──────────────────────────────────────────────────────
export interface TimelineState {
  mode: "live" | "replay";
  playbackTs: number | null; // null = live
  isPlaying: boolean;
  playbackSpeed: 1 | 2 | 5 | 10;
  availableTimestamps: number[];
  historyLoaded: boolean;
}

export interface LayerConfig {
  visible: boolean;
  showTrails?: boolean;
  showLabels?: boolean;
  showOrbits?: boolean;
  clustering?: boolean;
  maxVisible?: number;
  opacity?: number;
}

// ─── Store Interface ──────────────────────────────────────────────────────────
interface WorldViewState {
  // Connection
  status: "connecting" | "connected" | "reconnecting" | "degraded";
  lastMessageAt: string | null;

  // Data
  aircraft: Aircraft[];
  satellites: Satellite[];
  webcams: Webcam[];
  earthquakes: Earthquake[];
  alerts: WeatherAlert[];
  weatherConfig: WeatherConfig | null;
  weatherSummary: WeatherSummary[];
  feedStatus: Record<string, FeedStatus>;

  // UI
  layers: {
    aircraft: LayerConfig;
    satellites: LayerConfig;
    webcams: LayerConfig;
    earthquakes: LayerConfig;
    weather: LayerConfig;
    vessels: LayerConfig;
  };
  selectedEntity: SelectedEntity | null;
  imageryPreset: "ion" | "osm" | "dark";
  visualMode: "normal" | "green" | "mono";
  theme: "dark" | "light";
  panels: { left: boolean; right: boolean; bottom: boolean };
  activeTab: "aircraft" | "vessels" | "satellites" | "earthquakes" | "webcams" | "weather";
  filters: {
    globalSearch: string;
    earthquakes: { minMagnitude: number };
    aircraft: {
      classFilter: "all" | "military" | "civilian";
      minAltitude: number | null;
      maxAltitude: number | null;
      minSpeed: number | null;
      maxSpeed: number | null;
    };
    vessels: {
      categoryFilter: "all" | VesselCategory;
      minSpeed: number | null;
      maxSpeed: number | null;
    };
  };

  // Vessel data
  vessels: Vessel[];

  // Anomalies
  anomalies: Anomaly[];
  unacknowledgedAnomalyCount: number;

  // Timeline
  timeline: TimelineState;

  // Ruler tool
  ruler: RulerState;

  // Actions
  setStatus: (s: WorldViewState["status"]) => void;
  setLastMessageAt: (t: string) => void;
  setAircraft: (a: Aircraft[]) => void;
  setSatellites: (s: Satellite[]) => void;
  setWebcams: (w: Webcam[]) => void;
  setEarthquakes: (e: Earthquake[]) => void;
  setAlerts: (a: WeatherAlert[]) => void;
  setWeatherConfig: (c: WeatherConfig | null) => void;
  setWeatherSummary: (s: WeatherSummary[]) => void;
  setFeedStatus: (f: Record<string, FeedStatus>) => void;
  setSelectedEntity: (e: SelectedEntity | null) => void;
  setImageryPreset: (p: WorldViewState["imageryPreset"]) => void;
  setVisualMode: (m: WorldViewState["visualMode"]) => void;
  toggleTheme: () => void;
  updateLayer: (key: keyof WorldViewState["layers"], patch: Partial<LayerConfig>) => void;
  togglePanel: (key: keyof WorldViewState["panels"]) => void;
  setActiveTab: (tab: WorldViewState["activeTab"]) => void;
  setGlobalSearch: (s: string) => void;
  setMinMagnitude: (m: number) => void;
  setAircraftClassFilter: (f: "all" | "military" | "civilian") => void;
  setAircraftAltFilter: (min: number | null, max: number | null) => void;
  setAircraftSpeedFilter: (min: number | null, max: number | null) => void;
  setVesselCategoryFilter: (f: "all" | VesselCategory) => void;
  setVesselSpeedFilter: (min: number | null, max: number | null) => void;
  clearSelection: () => void;

  // Vessel actions
  setVessels: (v: Vessel[]) => void;

  // Anomaly actions
  setAnomalies: (a: Anomaly[]) => void;
  addAnomalies: (a: Anomaly[]) => void;
  acknowledgeAnomaly: (id: string) => void;

  // Timeline actions
  setTimelineMode: (mode: "live" | "replay") => void;
  setPlaybackTs: (ts: number | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: 1 | 2 | 5 | 10) => void;
  setAvailableTimestamps: (ts: number[]) => void;

  // Ruler actions
  toggleRuler: () => void;
  addRulerPoint: (point: RulerPoint) => void;
  removeLastRulerPoint: () => void;
  clearRuler: () => void;
  setRulerUnit: (unit: RulerUnit) => void;
}

// ─── Great-circle distance (Haversine) ───────────────────────────────────────
function haversineKm(a: RulerPoint, b: RulerPoint): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function computeRulerDistances(points: RulerPoint[]): { segments: number[]; total: number } {
  const segments: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversineKm(points[i - 1], points[i]);
    segments.push(d);
    total += d;
  }
  return { segments, total };
}

// ─── Store ────────────────────────────────────────────────────────────────────
const useStore = create<WorldViewState>((set) => ({
  status: "connecting",
  lastMessageAt: null,
  aircraft: [],
  satellites: [],
  webcams: [],
  earthquakes: [],
  alerts: [],
  weatherConfig: null,
  weatherSummary: [],
  feedStatus: {},
  layers: {
    aircraft: { visible: true, showTrails: false, showLabels: false, clustering: false, maxVisible: 1500 },
    satellites: { visible: true, showOrbits: true, showLabels: false, clustering: false, maxVisible: 120 },
    webcams: { visible: true, clustering: false, maxVisible: 60 },
    earthquakes: { visible: true, showLabels: false, clustering: false, maxVisible: 150 },
    weather: { visible: true, opacity: 0.55 },
    vessels: { visible: true, showTrails: true, showLabels: false, clustering: false, maxVisible: 500 },
  },
  selectedEntity: null,
  imageryPreset: "osm",
  visualMode: "normal",
  theme: "dark",
  panels: { left: true, right: true, bottom: true },
  activeTab: "aircraft",
  filters: {
    globalSearch: "",
    earthquakes: { minMagnitude: 2 },
    aircraft: { classFilter: "all", minAltitude: null, maxAltitude: null, minSpeed: null, maxSpeed: null },
    vessels: { categoryFilter: "all", minSpeed: null, maxSpeed: null },
  },
  vessels: [],
  anomalies: [],
  unacknowledgedAnomalyCount: 0,
  timeline: {
    mode: "live",
    playbackTs: null,
    isPlaying: false,
    playbackSpeed: 1,
    availableTimestamps: [],
    historyLoaded: false,
  },
  ruler: {
    active: false,
    points: [],
    unit: "km",
    totalDistance: 0,
    segmentDistances: [],
  },

  setStatus: (status) => set({ status }),
  setLastMessageAt: (lastMessageAt) => set({ lastMessageAt }),
  setAircraft: (raw) => {
    // Enrich with classification on ingest
    const aircraft = raw.map(a => ({
      ...a,
      aircraftClass: classifyAircraft(a.id, a.callsign, a.country, a.category),
      militarySubtype: classifyAircraft(a.id, a.callsign, a.country, a.category) === "military"
        ? getMilitarySubtype(a.callsign, a.id)
        : undefined,
    }));
    set({ aircraft });
  },
  setSatellites: (satellites) => set({ satellites }),
  setWebcams: (webcams) => set({ webcams }),
  setEarthquakes: (earthquakes) => set({ earthquakes }),
  setAlerts: (alerts) => set({ alerts }),
  setWeatherConfig: (weatherConfig) => set({ weatherConfig }),
  setWeatherSummary: (weatherSummary) => set({ weatherSummary }),
  setFeedStatus: (feedStatus) => set({ feedStatus: feedStatus ?? {} }),
  setSelectedEntity: (selectedEntity) => set({ selectedEntity }),
  setImageryPreset: (imageryPreset) => set({ imageryPreset }),
  setVisualMode: (visualMode) => set({ visualMode }),
  toggleTheme: () => set((state) => {
    const next = state.theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    return { theme: next };
  }),
  updateLayer: (key, patch) =>
    set((state) => ({
      layers: { ...state.layers, [key]: { ...state.layers[key], ...patch } },
    })),
  togglePanel: (key) =>
    set((state) => ({
      panels: { ...state.panels, [key]: !state.panels[key] },
    })),
  setActiveTab: (activeTab) => set({ activeTab }),
  setGlobalSearch: (globalSearch) =>
    set((state) => ({ filters: { ...state.filters, globalSearch } })),
  setMinMagnitude: (minMagnitude) =>
    set((state) => ({ filters: { ...state.filters, earthquakes: { ...state.filters.earthquakes, minMagnitude } } })),
  setAircraftClassFilter: (classFilter) =>
    set((state) => ({ filters: { ...state.filters, aircraft: { ...state.filters.aircraft, classFilter } } })),
  setAircraftAltFilter: (minAltitude, maxAltitude) =>
    set((state) => ({ filters: { ...state.filters, aircraft: { ...state.filters.aircraft, minAltitude, maxAltitude } } })),
  setAircraftSpeedFilter: (minSpeed, maxSpeed) =>
    set((state) => ({ filters: { ...state.filters, aircraft: { ...state.filters.aircraft, minSpeed, maxSpeed } } })),
  setVesselCategoryFilter: (categoryFilter) =>
    set((state) => ({ filters: { ...state.filters, vessels: { ...state.filters.vessels, categoryFilter } } })),
  setVesselSpeedFilter: (minSpeed, maxSpeed) =>
    set((state) => ({ filters: { ...state.filters, vessels: { ...state.filters.vessels, minSpeed, maxSpeed } } })),
  clearSelection: () => set({ selectedEntity: null }),

  setVessels: (vessels) => set({ vessels }),
  setAnomalies: (anomalies) => set({
    anomalies,
    unacknowledgedAnomalyCount: anomalies.filter(a => !a.acknowledged).length,
  }),
  addAnomalies: (newAnomalies) => set((state) => {
    const merged = [...newAnomalies, ...state.anomalies].slice(0, 100);
    return { anomalies: merged, unacknowledgedAnomalyCount: merged.filter(a => !a.acknowledged).length };
  }),
  acknowledgeAnomaly: (id) => set((state) => {
    const anomalies = state.anomalies.map(a => a.id === id ? { ...a, acknowledged: true } : a);
    return { anomalies, unacknowledgedAnomalyCount: anomalies.filter(a => !a.acknowledged).length };
  }),

  setTimelineMode: (mode) => set((state) => ({
    timeline: { ...state.timeline, mode, playbackTs: mode === "live" ? null : state.timeline.playbackTs },
  })),
  setPlaybackTs: (playbackTs) => set((state) => ({ timeline: { ...state.timeline, playbackTs } })),
  setIsPlaying: (isPlaying) => set((state) => ({ timeline: { ...state.timeline, isPlaying } })),
  setPlaybackSpeed: (playbackSpeed) => set((state) => ({ timeline: { ...state.timeline, playbackSpeed } })),
  setAvailableTimestamps: (availableTimestamps) => set((state) => ({
    timeline: { ...state.timeline, availableTimestamps, historyLoaded: availableTimestamps.length > 0 },
  })),

  // Ruler actions
  toggleRuler: () => set((state) => ({
    ruler: { ...state.ruler, active: !state.ruler.active, points: [], totalDistance: 0, segmentDistances: [] },
  })),
  addRulerPoint: (point) => set((state) => {
    const points = [...state.ruler.points, point];
    const { segments, total } = computeRulerDistances(points);
    return { ruler: { ...state.ruler, points, segmentDistances: segments, totalDistance: total } };
  }),
  removeLastRulerPoint: () => set((state) => {
    const points = state.ruler.points.slice(0, -1);
    const { segments, total } = computeRulerDistances(points);
    return { ruler: { ...state.ruler, points, segmentDistances: segments, totalDistance: total } };
  }),
  clearRuler: () => set((state) => ({
    ruler: { ...state.ruler, points: [], totalDistance: 0, segmentDistances: [] },
  })),
  setRulerUnit: (unit) => set((state) => ({ ruler: { ...state.ruler, unit } })),
}));

export default useStore;
