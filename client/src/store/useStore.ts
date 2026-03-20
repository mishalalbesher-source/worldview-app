import { create } from "zustand";

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
  type: "aircraft" | "satellites" | "webcams" | "earthquakes";
  id: string;
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
  };
  selectedEntity: SelectedEntity | null;
  imageryPreset: "ion" | "osm" | "dark";
  visualMode: "normal" | "green" | "mono";
  panels: { left: boolean; right: boolean; bottom: boolean };
  activeTab: "aircraft" | "satellites" | "earthquakes" | "webcams" | "weather";
  filters: {
    globalSearch: string;
    earthquakes: { minMagnitude: number };
  };

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
  updateLayer: (key: keyof WorldViewState["layers"], patch: Partial<LayerConfig>) => void;
  togglePanel: (key: keyof WorldViewState["panels"]) => void;
  setActiveTab: (tab: WorldViewState["activeTab"]) => void;
  setGlobalSearch: (s: string) => void;
  setMinMagnitude: (m: number) => void;
  clearSelection: () => void;
}

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
  },
  selectedEntity: null,
  imageryPreset: "osm",
  visualMode: "normal",
  panels: { left: true, right: true, bottom: true },
  activeTab: "aircraft",
  filters: { globalSearch: "", earthquakes: { minMagnitude: 2 } },

  setStatus: (status) => set({ status }),
  setLastMessageAt: (lastMessageAt) => set({ lastMessageAt }),
  setAircraft: (aircraft) => set({ aircraft }),
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
  clearSelection: () => set({ selectedEntity: null }),
}));

export default useStore;
