/**
 * History Ring Buffer
 *
 * Stores snapshots of all tracked entities at regular intervals.
 * Supports temporal playback: clients can request a snapshot at any past timestamp.
 *
 * Retention: 2 hours of data at 30-second intervals = 240 snapshots max
 * Memory estimate: ~500 aircraft × 100 bytes + ~20 vessels × 200 bytes ≈ ~60KB per snapshot
 *                  240 snapshots × 60KB ≈ ~15MB total — acceptable
 */

export interface HistorySnapshot {
  timestamp: number; // Unix ms
  aircraft: HistoryAircraftRecord[];
  vessels: HistoryVesselRecord[];
  earthquakes: HistoryEarthquakeRecord[];
  satellites: HistorySatelliteRecord[];
}

export interface HistoryAircraftRecord {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  alt: number | null;
  heading: number | null;
  velocity: number | null;
  onGround: boolean;
  country: string;
}

export interface HistoryVesselRecord {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  speed: number | null;
  heading: number | null;
  typeCategory: string;
  flag: string;
}

export interface HistoryEarthquakeRecord {
  id: string;
  lat: number;
  lon: number;
  magnitude: number;
  place: string;
  time: string | null;
}

export interface HistorySatelliteRecord {
  id: string;
  name: string;
  lat: number;
  lon: number;
  alt: number;
  category: string;
}

const MAX_SNAPSHOTS = 240; // 2 hours at 30s intervals
const SNAPSHOT_INTERVAL_MS = 30_000;

class HistoryRingBuffer {
  private snapshots: HistorySnapshot[] = [];
  private currentAircraft: HistoryAircraftRecord[] = [];
  private currentVessels: HistoryVesselRecord[] = [];
  private currentEarthquakes: HistoryEarthquakeRecord[] = [];
  private currentSatellites: HistorySatelliteRecord[] = [];

  constructor() {
    // Start snapshot timer
    setInterval(() => this.takeSnapshot(), SNAPSHOT_INTERVAL_MS);
  }

  // ─── Data setters (called by workers) ──────────────────────────────────────

  updateAircraft(aircraft: HistoryAircraftRecord[]): void {
    this.currentAircraft = aircraft;
  }

  updateVessels(vessels: HistoryVesselRecord[]): void {
    this.currentVessels = vessels;
  }

  updateEarthquakes(earthquakes: HistoryEarthquakeRecord[]): void {
    this.currentEarthquakes = earthquakes;
  }

  updateSatellites(satellites: HistorySatelliteRecord[]): void {
    this.currentSatellites = satellites;
  }

  // ─── Snapshot management ───────────────────────────────────────────────────

  private takeSnapshot(): void {
    if (
      this.currentAircraft.length === 0 &&
      this.currentVessels.length === 0 &&
      this.currentEarthquakes.length === 0 &&
      this.currentSatellites.length === 0
    ) {
      return; // Don't store empty snapshots
    }

    const snapshot: HistorySnapshot = {
      timestamp: Date.now(),
      aircraft: [...this.currentAircraft],
      vessels: [...this.currentVessels],
      earthquakes: [...this.currentEarthquakes],
      satellites: [...this.currentSatellites],
    };

    this.snapshots.push(snapshot);

    // Trim to max capacity (ring buffer behaviour)
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
  }

  // ─── Query interface ───────────────────────────────────────────────────────

  /** Get all available snapshot timestamps */
  getTimestamps(): number[] {
    return this.snapshots.map(s => s.timestamp);
  }

  /** Get the snapshot closest to a given timestamp */
  getSnapshotAt(targetMs: number): HistorySnapshot | null {
    if (this.snapshots.length === 0) return null;

    let closest = this.snapshots[0];
    let minDiff = Math.abs(targetMs - closest.timestamp);

    for (const snap of this.snapshots) {
      const diff = Math.abs(targetMs - snap.timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = snap;
      }
    }

    return closest;
  }

  /** Get all snapshots in a time range */
  getSnapshotsInRange(startMs: number, endMs: number): HistorySnapshot[] {
    return this.snapshots.filter(s => s.timestamp >= startMs && s.timestamp <= endMs);
  }

  /** Get the oldest available timestamp */
  getOldestTimestamp(): number | null {
    return this.snapshots.length > 0 ? this.snapshots[0].timestamp : null;
  }

  /** Get the newest available timestamp */
  getNewestTimestamp(): number | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1].timestamp : null;
  }

  /** Total number of stored snapshots */
  getSnapshotCount(): number {
    return this.snapshots.length;
  }

  /** Summary for health endpoint */
  getSummary() {
    return {
      snapshotCount: this.snapshots.length,
      maxSnapshots: MAX_SNAPSHOTS,
      oldestTimestamp: this.getOldestTimestamp(),
      newestTimestamp: this.getNewestTimestamp(),
      coverageMinutes: this.snapshots.length > 1
        ? Math.round((this.getNewestTimestamp()! - this.getOldestTimestamp()!) / 60_000)
        : 0,
    };
  }
}

// Singleton
let bufferInstance: HistoryRingBuffer | null = null;

export function getHistoryBuffer(): HistoryRingBuffer {
  if (!bufferInstance) {
    bufferInstance = new HistoryRingBuffer();
  }
  return bufferInstance;
}
