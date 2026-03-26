import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import useStore from "@/store/useStore";
import type { Aircraft, Satellite, Earthquake, Webcam, WeatherConfig, WeatherSummary, WeatherAlert, FeedStatus, Vessel, Anomaly } from "@/store/useStore";

const aircraftTrails = new Map<string, number[][]>();

function normalizeAircraft(payload: unknown[]): Aircraft[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((plane) => {
    const p = plane as Aircraft;
    const id = p.id;
    const pos: number[] = [p.longitude ?? 0, p.latitude ?? 0, p.altitude ?? 0];
    const existing = aircraftTrails.get(id) ?? [];
    const trail = [...existing, pos].slice(-30);
    aircraftTrails.set(id, trail);
    return {
      ...p,
      trail: Array.isArray(p.trail) && p.trail.length > 1 ? p.trail : trail,
    };
  });
}

export function useWorldViewSocket() {
  const socketRef = useRef<Socket | null>(null);
  const {
    setStatus,
    setLastMessageAt,
    setAircraft,
    setSatellites,
    setWebcams,
    setEarthquakes,
    setWeatherConfig,
    setWeatherSummary,
    setAlerts,
    setFeedStatus,
    setVessels,
    addAnomalies,
    setAvailableTimestamps,
  } = useStore();

  useEffect(() => {
    const socket = io(window.location.origin, {
      // Do NOT set path - use Socket.IO default (/socket.io/)
      transports: ["polling", "websocket"],
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      timeout: 20000,
      upgrade: true,
      forceNew: true,
    });
    socketRef.current = socket;
    setStatus("connecting");

    socket.on("connect", () => {
      setStatus("connected");
    });

    socket.on("disconnect", () => {
      setStatus("reconnecting");
    });

    socket.on("connect_error", () => {
      setStatus("degraded");
    });

    socket.on("message", (message: { type: string; data: unknown }) => {
      if (!message || typeof message !== "object" || !message.type) return;
      setLastMessageAt(new Date().toISOString());

      switch (message.type) {
        case "aircraft_updates":
          setAircraft(normalizeAircraft(message.data as unknown[]));
          break;
        case "satellite_updates":
          setSatellites(Array.isArray(message.data) ? (message.data as Satellite[]) : []);
          break;
        case "earthquake_updates":
          setEarthquakes(Array.isArray(message.data) ? (message.data as Earthquake[]) : []);
          break;
        case "webcams":
          setWebcams(Array.isArray(message.data) ? (message.data as Webcam[]) : []);
          break;
        case "weather_config":
          setWeatherConfig(message.data as WeatherConfig | null);
          break;
        case "weather_summary":
          setWeatherSummary(Array.isArray(message.data) ? (message.data as WeatherSummary[]) : []);
          break;
        case "weather_alerts":
          setAlerts(Array.isArray(message.data) ? (message.data as WeatherAlert[]) : []);
          break;
        case "feed_status":
          setFeedStatus(message.data as Record<string, FeedStatus>);
          break;
        case "vessel_updates":
          setVessels(Array.isArray(message.data) ? (message.data as Vessel[]) : []);
          break;
        case "anomaly_updates":
          addAnomalies(Array.isArray(message.data) ? (message.data as Anomaly[]) : []);
          break;
        default:
          break;
      }
    });

    // Load history timestamps on connect
    socket.on("connect", async () => {
      setStatus("connected");
      try {
        const res = await fetch("/api/history/timestamps");
        if (res.ok) {
          const data = await res.json() as { timestamps: number[] };
          setAvailableTimestamps(data.timestamps ?? []);
        }
      } catch { /* ignore */ }
    });

    return () => {
      socket.disconnect();
    };
  }, [setStatus, setLastMessageAt, setAircraft, setSatellites, setWebcams, setEarthquakes, setWeatherConfig, setWeatherSummary, setAlerts, setFeedStatus, setVessels, addAnomalies, setAvailableTimestamps]);
}
