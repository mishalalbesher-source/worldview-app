import { WorldViewManager } from "../wsManager";
import { getHistoryBuffer } from "../historyBuffer";
import { analyzeEarthquakes } from "../anomalyEngine";

const USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson";
const POLL_INTERVAL = 180_000; // 3 minutes

export async function startEarthquakeWorker(manager: WorldViewManager): Promise<void> {
  const poll = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      const res = await fetch(USGS_URL, {
        signal: controller.signal,
        headers: {
          Accept: "application/geo+json",
          "User-Agent": "worldview-app/1.0",
        },
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
      const payload = await res.json() as { features?: unknown[] };
      const features = payload.features ?? [];
      const earthquakes = [];

      for (const feature of features.slice(0, 250)) {
        const f = feature as Record<string, unknown>;
        const geometry = f.geometry as Record<string, unknown> | undefined;
        const coords = (geometry?.coordinates as number[]) ?? [];
        if (coords.length < 3) continue;
        const props = f.properties as Record<string, unknown> | undefined;
        const quakeTime = props?.time as number | undefined;
        const observedAt = quakeTime
          ? new Date(quakeTime).toISOString()
          : null;
        earthquakes.push({
          id: f.id as string,
          title: (props?.title as string) ?? "Earthquake",
          place: (props?.place as string) ?? "Unknown location",
          magnitude: (props?.mag as number) ?? 0,
          depthKm: coords[2],
          longitude: coords[0],
          latitude: coords[1],
          time: observedAt,
          significance: (props?.sig as number) ?? 0,
          tsunami: Boolean(props?.tsunami),
          status: (props?.status as string) ?? "unknown",
          felt: (props?.felt as number) ?? 0,
          url: props?.url as string | undefined,
          source: "USGS",
        });
      }

      earthquakes.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));

      // Feed history buffer
      getHistoryBuffer().updateEarthquakes(earthquakes.map(e => ({
        id: e.id,
        lat: e.latitude,
        lon: e.longitude,
        magnitude: e.magnitude,
        place: e.place,
        time: e.time,
      })));
      // Run anomaly detection
      const newAnomalies = analyzeEarthquakes(earthquakes.map(e => ({
        id: e.id,
        place: e.place,
        magnitude: e.magnitude,
        latitude: e.latitude,
        longitude: e.longitude,
        tsunami: e.tsunami,
        time: e.time,
      })));
      if (newAnomalies.length > 0) {
        manager.broadcast("anomaly_updates", newAnomalies);
      }
      manager.broadcast("earthquake_updates", earthquakes);
      manager.updateFeedStatus("earthquakes", {
        status: "live",
        detail: `USGS feed returned ${earthquakes.length} earthquakes`,
        itemCount: earthquakes.length,
      });
    } catch (err) {
      console.warn("[EarthquakeWorker] Error:", err);
      manager.updateFeedStatus("earthquakes", {
        status: "error",
        detail: `Earthquake feed error: ${err}`,
        itemCount: 0,
      });
    }
  };

  await poll();
  setInterval(poll, POLL_INTERVAL);
}
