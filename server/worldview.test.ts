import { describe, expect, it } from "vitest";

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

// ─── Aircraft Classification ──────────────────────────────────────────────────

type AircraftClass = "military" | "civilian" | "unknown";
type MilitarySubtype = "fighter" | "isr" | "transport" | "uav" | "helicopter" | "other";

function classifyAircraft(icao24: string, callsign: string, _country: string, category: number): AircraftClass {
  const id = icao24.toLowerCase();
  const cs = (callsign || "").toUpperCase();
  if (category === 8) return "military";
  const militaryCallsigns = /^(RCH|REACH|USAF|NAVY|ARMY|USMC|EVAC|MEDEVAC|PAT|JAKE|SPAR|VENUS|BOXER|MAGMA|TOPAZ|IRON|STEEL|GHOST|SHADOW|EAGLE|HAWK|VIPER|RAVEN|FALCON|THUNDER|STORM|COBRA|WOLF|BEAR|TIGER|LION|DRAGON|KNIGHT)/;
  if (militaryCallsigns.test(cs)) return "military";
  if (id >= "ae0000" && id <= "afffff") return "military";
  if (id >= "43c000" && id <= "43ffff") return "military";
  if (id >= "3b0000" && id <= "3bffff") return "military";
  if (id >= "3dc000" && id <= "3dffff") return "military";
  if (id >= "0d0000" && id <= "0dffff") return "military";
  if (id >= "7b0000" && id <= "7bffff") return "military";
  return "civilian";
}

function getMilitarySubtype(callsign: string, icao24: string): MilitarySubtype {
  const cs = (callsign || "").toUpperCase();
  const id = icao24.toLowerCase();
  if (/^(JSTARS|AWACS|RIVET|COBRA|SENTRY|DRAGON|SHADOW|REAPER|GLOBAL|TRITON|POSEIDON|NEPTUNE|ORION|SENTINEL|GUARDIAN)/.test(cs)) return "isr";
  if (/^(RQ|MQ|PRED|REAPER|GLOBAL|TRITON|SCAN|HERON|HERMES)/.test(cs)) return "uav";
  if (/^(RCH|REACH|ATLAS|STARLIFTER|GALAXY|GLOBEMASTER|HERCULES|SPARTAN|CASA|TRANSALL)/.test(cs)) return "transport";
  if (/^(DUSTOFF|MEDEVAC|PEDRO|JOLLY|PAVE|KNIFE|LIFEGUARD)/.test(cs)) return "helicopter";
  if (id >= "ae0000" && id <= "afffff") return "fighter";
  return "other";
}

// ─── Ruler Distance ───────────────────────────────────────────────────────────

interface RulerPoint { longitude: number; latitude: number; }

function haversineKm(a: RulerPoint, b: RulerPoint): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatRulerDistance(km: number, unit: "km" | "nm" | "mi"): string {
  if (unit === "nm") return `${(km * 0.539957).toFixed(1)} NM`;
  if (unit === "mi") return `${(km * 0.621371).toFixed(1)} mi`;
  return km >= 1000 ? `${(km / 1000).toFixed(2)} Mm` : `${km.toFixed(1)} km`;
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
  it("returns null for null/undefined/NaN/Infinity", () => {
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

describe("Aircraft Classification", () => {
  it("classifies US military ICAO hex range as military", () => {
    expect(classifyAircraft("ae1234", "", "United States", 0)).toBe("military");
    expect(classifyAircraft("af0000", "", "United States", 0)).toBe("military");
    expect(classifyAircraft("afffff", "", "United States", 0)).toBe("military");
  });

  it("classifies UK military ICAO hex range as military", () => {
    expect(classifyAircraft("43c500", "", "United Kingdom", 0)).toBe("military");
    expect(classifyAircraft("43ffff", "", "United Kingdom", 0)).toBe("military");
  });

  it("classifies French military ICAO hex range as military", () => {
    expect(classifyAircraft("3b1000", "", "France", 0)).toBe("military");
  });

  it("classifies OpenSky category 8 as military regardless of ICAO", () => {
    expect(classifyAircraft("a00001", "", "United States", 8)).toBe("military");
    expect(classifyAircraft("400001", "", "United Kingdom", 8)).toBe("military");
  });

  it("classifies military callsign patterns as military", () => {
    expect(classifyAircraft("a00001", "RCH123", "United States", 0)).toBe("military");
    expect(classifyAircraft("a00001", "REACH456", "United States", 0)).toBe("military");
    expect(classifyAircraft("a00001", "NAVY001", "United States", 0)).toBe("military");
    expect(classifyAircraft("a00001", "EAGLE01", "United States", 0)).toBe("military");
  });

  it("classifies civilian airline callsigns as civilian", () => {
    expect(classifyAircraft("a00001", "UAL123", "United States", 0)).toBe("civilian");
    expect(classifyAircraft("400001", "BAW456", "United Kingdom", 0)).toBe("civilian");
    expect(classifyAircraft("3c0001", "DLH789", "Germany", 0)).toBe("civilian");
  });

  it("handles empty callsign gracefully", () => {
    expect(classifyAircraft("a00001", "", "Unknown", 0)).toBe("civilian");
  });
});

describe("Military Subtype Classification", () => {
  it("identifies transport aircraft by callsign", () => {
    expect(getMilitarySubtype("RCH123", "ae1234")).toBe("transport");
    expect(getMilitarySubtype("REACH456", "ae1234")).toBe("transport");
    expect(getMilitarySubtype("HERCULES1", "ae1234")).toBe("transport");
  });

  it("identifies ISR aircraft by callsign", () => {
    expect(getMilitarySubtype("AWACS01", "ae1234")).toBe("isr");
    expect(getMilitarySubtype("RIVET01", "ae1234")).toBe("isr");
    expect(getMilitarySubtype("SENTINEL1", "ae1234")).toBe("isr");
  });

  it("identifies UAV by callsign prefix", () => {
    expect(getMilitarySubtype("MQ9REAPER", "ae1234")).toBe("uav");
    expect(getMilitarySubtype("RQ4GLOBAL", "ae1234")).toBe("uav");
  });

  it("identifies helicopter by callsign", () => {
    expect(getMilitarySubtype("MEDEVAC01", "ae1234")).toBe("helicopter");
    expect(getMilitarySubtype("DUSTOFF01", "ae1234")).toBe("helicopter");
  });

  it("defaults to fighter for US military ICAO range without specific callsign", () => {
    expect(getMilitarySubtype("UNKN001", "ae1234")).toBe("fighter");
    expect(getMilitarySubtype("", "af0000")).toBe("fighter");
  });

  it("defaults to other for non-US military ICAO range", () => {
    expect(getMilitarySubtype("UNKN001", "43c500")).toBe("other");
    expect(getMilitarySubtype("", "3b1000")).toBe("other");
  });
});

describe("Ruler Distance Calculation (Haversine)", () => {
  it("calculates zero distance for same point", () => {
    const p = { longitude: 0, latitude: 0 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 5);
  });

  it("calculates equatorial distance correctly (1 degree ≈ 111.32 km)", () => {
    const a = { longitude: 0, latitude: 0 };
    const b = { longitude: 1, latitude: 0 };
    expect(haversineKm(a, b)).toBeCloseTo(111.32, 0);
  });

  it("calculates London to Paris distance (~340 km)", () => {
    const london = { longitude: -0.1278, latitude: 51.5074 };
    const paris = { longitude: 2.3522, latitude: 48.8566 };
    const dist = haversineKm(london, paris);
    expect(dist).toBeGreaterThan(330);
    expect(dist).toBeLessThan(360);
  });

  it("calculates New York to Los Angeles distance (~3940 km)", () => {
    const nyc = { longitude: -74.006, latitude: 40.7128 };
    const la = { longitude: -118.2437, latitude: 34.0522 };
    const dist = haversineKm(nyc, la);
    expect(dist).toBeGreaterThan(3900);
    expect(dist).toBeLessThan(4000);
  });

  it("is symmetric (distance A→B equals B→A)", () => {
    const a = { longitude: 10, latitude: 45 };
    const b = { longitude: -30, latitude: 60 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });
});

describe("Ruler Distance Formatter", () => {
  it("formats km correctly for short distances", () => {
    expect(formatRulerDistance(42.5, "km")).toBe("42.5 km");
    expect(formatRulerDistance(0.1, "km")).toBe("0.1 km");
  });

  it("formats km as Mm for distances over 1000 km", () => {
    expect(formatRulerDistance(1500, "km")).toBe("1.50 Mm");
    expect(formatRulerDistance(20015, "km")).toBe("20.02 Mm");
  });

  it("converts km to nautical miles", () => {
    expect(formatRulerDistance(100, "nm")).toBe("54.0 NM");
  });

  it("converts km to statute miles", () => {
    expect(formatRulerDistance(100, "mi")).toBe("62.1 mi");
  });

  it("handles zero distance", () => {
    expect(formatRulerDistance(0, "km")).toBe("0.0 km");
    expect(formatRulerDistance(0, "nm")).toBe("0.0 NM");
    expect(formatRulerDistance(0, "mi")).toBe("0.0 mi");
  });
});

describe("aircraft data normalization", () => {
  it("normalizes OpenSky state array to aircraft object", () => {
    const stateArray = [
      "abc123", "UAL1844 ", "United States",
      1710000000, 1710000001, -87.6298, 41.8781,
      10668, false, 236, 270, 0, null, 10668, "4B1A3C", false, 0,
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
      geometry: { type: "Point", coordinates: [-117.6, 35.7, 8.5] },
    };

    const quake = {
      id: feature.id,
      magnitude: feature.properties.mag,
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
      depthKm: feature.geometry.coordinates[2],
      tsunami: feature.properties.tsunami === 1,
      significance: feature.properties.sig,
      felt: feature.properties.felt ?? 0,
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
  it("validates TLE line length format", () => {
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
