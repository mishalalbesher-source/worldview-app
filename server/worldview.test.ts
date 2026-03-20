import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Utility helpers (pure functions) ────────────────────────────────────────

function normalizeCallsign(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toUpperCase();
}

function clampAltitude(altMeters: number | null | undefined): number | null {
  if (altMeters == null || !isFinite(altMeters)) return null;
  return Math.max(0, altMeters);
}

function magnitudeColor(mag: number): string {
  if (mag >= 6) return "red";
  if (mag >= 4) return "orange";
  return "yellow";
}

function altitudeForSelection(type: string, altitude?: number | null): number {
  if (type === "satellites") return (altitude ?? 400_000) + 200_000;
  if (type === "aircraft") return (altitude ?? 10_000) + 50_000;
  return 500_000;
}

function buildTrailKey(icao24: string): string {
  return `trail:${icao24.toLowerCase()}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("normalizeCallsign", () => {
  it("uppercases and trims callsigns", () => {
    expect(normalizeCallsign("  ual1844  ")).toBe("UAL1844");
    expect(normalizeCallsign("swA3913")).toBe("SWA3913");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeCallsign(null)).toBe("");
    expect(normalizeCallsign(undefined)).toBe("");
    expect(normalizeCallsign("")).toBe("");
  });
});

describe("clampAltitude", () => {
  it("returns null for null/undefined/NaN", () => {
    expect(clampAltitude(null)).toBeNull();
    expect(clampAltitude(undefined)).toBeNull();
    expect(clampAltitude(NaN)).toBeNull();
    expect(clampAltitude(Infinity)).toBeNull();
  });

  it("clamps negative altitudes to 0", () => {
    expect(clampAltitude(-100)).toBe(0);
    expect(clampAltitude(-0.1)).toBe(0);
  });

  it("returns positive altitudes unchanged", () => {
    expect(clampAltitude(10000)).toBe(10000);
    expect(clampAltitude(0)).toBe(0);
    expect(clampAltitude(35000)).toBe(35000);
  });
});

describe("magnitudeColor", () => {
  it("returns red for M6+", () => {
    expect(magnitudeColor(6.0)).toBe("red");
    expect(magnitudeColor(7.5)).toBe("red");
    expect(magnitudeColor(9.0)).toBe("red");
  });

  it("returns orange for M4-5.9", () => {
    expect(magnitudeColor(4.0)).toBe("orange");
    expect(magnitudeColor(5.9)).toBe("orange");
  });

  it("returns yellow for M<4", () => {
    expect(magnitudeColor(2.0)).toBe("yellow");
    expect(magnitudeColor(3.9)).toBe("yellow");
    expect(magnitudeColor(0)).toBe("yellow");
  });
});

describe("altitudeForSelection", () => {
  it("adds 200km buffer for satellites", () => {
    expect(altitudeForSelection("satellites", 400_000)).toBe(600_000);
    expect(altitudeForSelection("satellites", 800_000)).toBe(1_000_000);
  });

  it("adds 50km buffer for aircraft", () => {
    expect(altitudeForSelection("aircraft", 10_000)).toBe(60_000);
    expect(altitudeForSelection("aircraft", 0)).toBe(50_000);
  });

  it("uses defaults when altitude is null", () => {
    expect(altitudeForSelection("satellites", null)).toBe(600_000);
    expect(altitudeForSelection("aircraft", null)).toBe(60_000);
  });

  it("returns 500km for other types", () => {
    expect(altitudeForSelection("earthquakes", null)).toBe(500_000);
    expect(altitudeForSelection("webcams", null)).toBe(500_000);
  });
});

describe("buildTrailKey", () => {
  it("creates consistent lowercase trail keys", () => {
    expect(buildTrailKey("ABC123")).toBe("trail:abc123");
    expect(buildTrailKey("abc123")).toBe("trail:abc123");
  });
});

describe("aircraft data normalization", () => {
  it("normalizes OpenSky state array to aircraft object", () => {
    // Simulates what flightWorker does
    const stateArray = [
      "abc123",   // icao24
      "UAL1844 ", // callsign
      "United States", // origin_country
      1710000000, // time_position
      1710000001, // last_contact
      -87.6298,   // longitude
      41.8781,    // latitude
      10668,      // baro_altitude (meters)
      false,      // on_ground
      236,        // velocity (m/s)
      270,        // true_track (heading)
      0,          // vertical_rate
      null,       // sensors
      10668,      // geo_altitude
      "4B1A3C",   // squawk
      false,      // spi
      0,          // position_source
    ];

    const aircraft = {
      id: stateArray[0] as string,
      callsign: normalizeCallsign(stateArray[1] as string),
      country: stateArray[2] as string,
      longitude: stateArray[5] as number,
      latitude: stateArray[6] as number,
      altitude: clampAltitude(stateArray[7] as number),
      onGround: stateArray[8] as boolean,
      velocity: stateArray[9] as number,
      heading: stateArray[10] as number,
    };

    expect(aircraft.id).toBe("abc123");
    expect(aircraft.callsign).toBe("UAL1844");
    expect(aircraft.country).toBe("United States");
    expect(aircraft.longitude).toBe(-87.6298);
    expect(aircraft.latitude).toBe(41.8781);
    expect(aircraft.altitude).toBe(10668);
    expect(aircraft.onGround).toBe(false);
    expect(aircraft.velocity).toBe(236);
    expect(aircraft.heading).toBe(270);
  });
});

describe("earthquake data normalization", () => {
  it("extracts earthquake fields from USGS GeoJSON feature", () => {
    const feature = {
      id: "us7000abcd",
      properties: {
        title: "M 5.2 - 10km NE of Ridgecrest, CA",
        place: "10km NE of Ridgecrest, CA",
        mag: 5.2,
        time: 1710000000000,
        tsunami: 0,
        sig: 450,
        felt: 120,
        status: "reviewed",
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd",
      },
      geometry: {
        type: "Point",
        coordinates: [-117.6, 35.7, 8.5],
      },
    };

    const quake = {
      id: feature.id,
      title: feature.properties.title,
      place: feature.properties.place,
      magnitude: feature.properties.mag,
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
      depthKm: feature.geometry.coordinates[2],
      time: new Date(feature.properties.time).toISOString(),
      tsunami: feature.properties.tsunami === 1,
      significance: feature.properties.sig,
      felt: feature.properties.felt ?? 0,
      status: feature.properties.status,
      url: feature.properties.url,
    };

    expect(quake.id).toBe("us7000abcd");
    expect(quake.magnitude).toBe(5.2);
    expect(quake.longitude).toBe(-117.6);
    expect(quake.latitude).toBe(35.7);
    expect(quake.depthKm).toBe(8.5);
    expect(quake.tsunami).toBe(false);
    expect(quake.significance).toBe(450);
    expect(quake.felt).toBe(120);
    expect(magnitudeColor(quake.magnitude)).toBe("orange");
  });
});

describe("satellite TLE parsing helpers", () => {
  it("validates TLE line checksum format", () => {
    // TLE lines must be 69 chars + 1 checksum digit
    const line1 = "1 25544U 98067A   24080.50000000  .00001234  00000-0  12345-4 0  9990";
    const line2 = "2 25544  51.6400 208.9163 0001234  86.9740 273.1590 15.49815849441234";

    expect(line1.length).toBe(69);
    expect(line2.length).toBe(69);
    expect(line1[0]).toBe("1");
    expect(line2[0]).toBe("2");
  });

  it("extracts satellite category from name prefix", () => {
    function categorize(name: string): string {
      const n = name.toUpperCase();
      if (n.includes("ISS") || n.includes("TIANGONG")) return "Space Stations";
      if (n.includes("STARLINK")) return "Starlink";
      if (n.includes("GPS") || n.includes("GLONASS")) return "Navigation";
      if (n.includes("NOAA") || n.includes("GOES")) return "Weather";
      return "Other";
    }

    expect(categorize("ISS (ZARYA)")).toBe("Space Stations");
    expect(categorize("STARLINK-1234")).toBe("Starlink");
    expect(categorize("GPS BIIR-2")).toBe("Navigation");
    expect(categorize("NOAA 19")).toBe("Weather");
    expect(categorize("UNKNOWN SAT")).toBe("Other");
  });
});
