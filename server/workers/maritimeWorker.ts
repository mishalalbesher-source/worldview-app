/**
 * Maritime AIS Vessel Tracking Worker
 *
 * Primary source: AISStream.io WebSocket (free, requires API key)
 * Fallback: Simulated realistic vessel traffic for demo mode
 *
 * Vessel types tracked:
 *   - Cargo ships (type 70-79)
 *   - Tankers (type 80-89)
 *   - Passenger ships (type 60-69)
 *   - Military vessels (type 35)
 *   - SAR / Coast Guard (type 51-52)
 *   - Fishing vessels (type 30)
 *   - Pleasure craft / sailing (type 36-37)
 */

import WebSocket from "ws";
import { WorldViewManager } from "../wsManager";
import { getHistoryBuffer } from "../historyBuffer";
import { analyzeVessels } from "../anomalyEngine";

const AISSTREAM_WS = "wss://stream.aisstream.io/v0/stream";
const RECONNECT_DELAY = 15_000;
const MAX_VESSELS = 500; // cap for performance

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
  speed: number | null;       // knots
  heading: number | null;     // degrees
  course: number | null;      // COG degrees
  status: number | null;      // AIS navigational status
  statusName: string;
  destination: string;
  draught: number | null;     // meters
  length: number | null;      // meters
  width: number | null;
  trail: number[][];          // [lon, lat, speed][]
  last_seen: string;
  source: string;
}

export type VesselCategory =
  | "cargo"
  | "tanker"
  | "passenger"
  | "military"
  | "sar"
  | "fishing"
  | "pleasure"
  | "tug"
  | "other";

// ─── Vessel type classification ───────────────────────────────────────────────

function getVesselTypeName(type: number): string {
  if (type === 0) return "Unknown";
  if (type >= 20 && type <= 28) return "Wing in Ground";
  if (type === 29) return "Search and Rescue Aircraft";
  if (type === 30) return "Fishing";
  if (type === 31 || type === 32) return "Towing";
  if (type === 33) return "Dredging";
  if (type === 34) return "Diving";
  if (type === 35) return "Military";
  if (type === 36) return "Sailing";
  if (type === 37) return "Pleasure Craft";
  if (type >= 40 && type <= 49) return "High Speed Craft";
  if (type === 50) return "Pilot Vessel";
  if (type === 51) return "Search and Rescue";
  if (type === 52) return "Tug";
  if (type === 53) return "Port Tender";
  if (type === 54) return "Anti-Pollution";
  if (type === 55) return "Law Enforcement";
  if (type === 58) return "Medical Transport";
  if (type === 59) return "Non-combatant";
  if (type >= 60 && type <= 69) return "Passenger";
  if (type >= 70 && type <= 79) return "Cargo";
  if (type >= 80 && type <= 89) return "Tanker";
  if (type >= 90 && type <= 99) return "Other";
  return "Unknown";
}

function getVesselCategory(type: number): VesselCategory {
  if (type >= 70 && type <= 79) return "cargo";
  if (type >= 80 && type <= 89) return "tanker";
  if (type >= 60 && type <= 69) return "passenger";
  if (type === 35 || type === 55 || type === 59) return "military";
  if (type === 51 || type === 52 || type === 29) return "sar";
  if (type === 30) return "fishing";
  if (type === 36 || type === 37) return "pleasure";
  if (type === 52 || type === 31 || type === 32) return "tug";
  return "other";
}

const AIS_NAV_STATUS: Record<number, string> = {
  0: "Underway (Engine)",
  1: "At Anchor",
  2: "Not Under Command",
  3: "Restricted Manoeuvrability",
  4: "Constrained by Draught",
  5: "Moored",
  6: "Aground",
  7: "Engaged in Fishing",
  8: "Underway (Sailing)",
  15: "Unknown",
};

function getNavStatusName(status: number | null): string {
  if (status === null) return "Unknown";
  return AIS_NAV_STATUS[status] ?? "Unknown";
}

// ─── MMSI to flag country mapping (top maritime nations) ─────────────────────

function getFlagFromMMSI(mmsi: string): string {
  const mid = parseInt(mmsi.substring(0, 3), 10);
  const flags: Record<number, string> = {
    201: "Albania", 202: "Andorra", 203: "Austria", 204: "Azores",
    205: "Belgium", 206: "Belarus", 207: "Bulgaria", 208: "Vatican",
    209: "Cyprus", 210: "Cyprus", 211: "Germany", 212: "Cyprus",
    213: "Georgia", 214: "Moldova", 215: "Malta", 216: "Armenia",
    218: "Germany", 219: "Denmark", 220: "Denmark", 224: "Spain",
    225: "Spain", 226: "France", 227: "France", 228: "France",
    229: "Malta", 230: "Finland", 231: "Faroe Islands", 232: "United Kingdom",
    233: "United Kingdom", 234: "United Kingdom", 235: "United Kingdom",
    236: "Gibraltar", 237: "Greece", 238: "Croatia", 239: "Greece",
    240: "Greece", 241: "Greece", 242: "Morocco", 243: "Hungary",
    244: "Netherlands", 245: "Netherlands", 246: "Netherlands",
    247: "Italy", 248: "Malta", 249: "Malta", 250: "Ireland",
    251: "Iceland", 252: "Liechtenstein", 253: "Luxembourg",
    254: "Monaco", 255: "Madeira", 256: "Malta", 257: "Norway",
    258: "Norway", 259: "Norway", 261: "Poland", 262: "Montenegro",
    263: "Portugal", 264: "Romania", 265: "Sweden", 266: "Sweden",
    267: "Slovakia", 268: "San Marino", 269: "Switzerland",
    270: "Czech Republic", 271: "Turkey", 272: "Ukraine",
    273: "Russia", 274: "North Macedonia", 275: "Latvia",
    276: "Estonia", 277: "Lithuania", 278: "Slovenia", 279: "Serbia",
    301: "Anguilla", 303: "USA", 304: "Antigua and Barbuda",
    305: "Antigua and Barbuda", 306: "Curaçao", 307: "Aruba",
    308: "Bahamas", 309: "Bahamas", 310: "Bermuda", 311: "Bahamas",
    312: "Belize", 314: "Barbados", 316: "Canada", 319: "Cayman Islands",
    321: "Costa Rica", 323: "Cuba", 325: "Dominica", 327: "Dominican Republic",
    329: "Guadeloupe", 330: "Grenada", 331: "Greenland", 332: "Guatemala",
    334: "Honduras", 336: "Haiti", 338: "USA", 339: "Jamaica",
    341: "Saint Kitts and Nevis", 343: "Saint Lucia", 345: "Mexico",
    347: "Martinique", 348: "Montserrat", 350: "Nicaragua",
    351: "Panama", 352: "Panama", 353: "Panama", 354: "Panama",
    355: "Panama", 356: "Panama", 357: "Panama", 358: "Puerto Rico",
    359: "El Salvador", 361: "Saint Pierre and Miquelon",
    362: "Trinidad and Tobago", 364: "Turks and Caicos Islands",
    366: "USA", 367: "USA", 368: "USA", 369: "USA", 370: "Panama",
    371: "Panama", 372: "Panama", 373: "Panama", 374: "Panama",
    375: "Saint Vincent and the Grenadines", 376: "Saint Vincent and the Grenadines",
    377: "Saint Vincent and the Grenadines", 378: "British Virgin Islands",
    379: "US Virgin Islands",
    401: "Afghanistan", 403: "Saudi Arabia", 405: "Bangladesh",
    408: "Bahrain", 410: "Bhutan", 412: "China", 413: "China",
    414: "China", 416: "Taiwan", 422: "Iran", 423: "Azerbaijan",
    425: "Iraq", 428: "Israel", 431: "Japan", 432: "Japan",
    434: "Turkmenistan", 436: "Kazakhstan", 437: "Uzbekistan",
    438: "Jordan", 440: "South Korea", 441: "South Korea",
    443: "Palestine", 445: "North Korea", 447: "Kuwait",
    450: "Lebanon", 451: "Kyrgyzstan", 453: "Macao", 455: "Maldives",
    457: "Mongolia", 459: "Nepal", 461: "Oman", 463: "Pakistan",
    466: "Qatar", 468: "Syria", 470: "UAE", 471: "UAE",
    472: "Tajikistan", 473: "Yemen", 477: "Hong Kong",
    478: "Bosnia and Herzegovina",
    501: "Antarctica", 503: "Australia", 506: "Myanmar",
    508: "Brunei", 510: "Micronesia", 511: "Palau", 512: "New Zealand",
    514: "Cambodia", 515: "Cambodia", 516: "Christmas Island",
    518: "Cook Islands", 520: "Fiji", 523: "Cocos Islands",
    525: "Indonesia", 529: "Kiribati", 531: "Laos", 533: "Malaysia",
    536: "Northern Mariana Islands", 538: "Marshall Islands",
    540: "New Caledonia", 542: "Niue", 544: "Nauru", 546: "French Polynesia",
    548: "Philippines", 553: "Papua New Guinea", 555: "Pitcairn Islands",
    557: "Solomon Islands", 559: "American Samoa", 561: "Samoa",
    563: "Singapore", 564: "Singapore", 565: "Singapore", 566: "Singapore",
    567: "Thailand", 570: "Tonga", 572: "Tuvalu", 574: "Vietnam",
    576: "Vanuatu", 577: "Vanuatu", 578: "Wallis and Futuna",
    601: "South Africa", 603: "Angola", 605: "Algeria",
    607: "Saint Paul Island", 608: "Ascension Island",
    609: "Burundi", 610: "Benin", 611: "Botswana", 612: "Central African Republic",
    613: "Cameroon", 615: "Congo", 616: "Comoros", 617: "Cape Verde",
    618: "Antarctica", 619: "Ivory Coast", 620: "Comoros",
    621: "Djibouti", 622: "Egypt", 624: "Ethiopia", 625: "Eritrea",
    626: "Gabon", 627: "Ghana", 629: "Gambia", 630: "Guinea-Bissau",
    631: "Equatorial Guinea", 632: "Guinea", 633: "Burkina Faso",
    634: "Kenya", 635: "Antarctica", 636: "Liberia", 637: "Liberia",
    638: "South Sudan", 642: "Libya", 644: "Lesotho", 645: "Mauritius",
    647: "Madagascar", 649: "Mali", 650: "Mozambique", 654: "Mauritania",
    655: "Malawi", 656: "Niger", 657: "Nigeria", 659: "Namibia",
    660: "Reunion", 661: "Rwanda", 662: "Sudan", 663: "Senegal",
    664: "Seychelles", 665: "Saint Helena", 666: "Somalia",
    667: "Sierra Leone", 668: "Sao Tome and Principe", 669: "Swaziland",
    670: "Chad", 671: "Togo", 672: "Tunisia", 674: "Tanzania",
    675: "Uganda", 676: "DR Congo", 677: "Tanzania", 678: "Zambia",
    679: "Zimbabwe", 701: "Argentina", 710: "Brazil", 720: "Bolivia",
    725: "Chile", 730: "Colombia", 735: "Ecuador", 740: "Falkland Islands",
    745: "Guiana", 750: "Guyana", 755: "Paraguay", 760: "Peru",
    765: "Suriname", 770: "Uruguay", 775: "Venezuela",
  };
  return flags[mid] ?? "Unknown";
}

// ─── Demo vessel data ─────────────────────────────────────────────────────────

interface DemoVesselTemplate {
  mmsi: string;
  name: string;
  callsign: string;
  type: number;
  lat: number;
  lon: number;
  speed: number;
  heading: number;
  destination: string;
  length: number;
}

const DEMO_VESSELS: DemoVesselTemplate[] = [
  // Major shipping lanes - Atlantic
  { mmsi: "636015814", name: "EVER GIVEN", callsign: "V7YL2", type: 70, lat: 51.9, lon: 1.2, speed: 12.5, heading: 270, destination: "ROTTERDAM", length: 400 },
  { mmsi: "477307900", name: "MSC OSCAR", callsign: "VRQM7", type: 70, lat: 48.5, lon: -5.2, speed: 14.0, heading: 280, destination: "LE HAVRE", length: 395 },
  { mmsi: "255805960", name: "MAERSK ESSEX", callsign: "CQHB", type: 70, lat: 35.8, lon: -14.5, speed: 13.2, heading: 355, destination: "ALGECIRAS", length: 347 },
  { mmsi: "538007561", name: "NORDIC ORION", callsign: "V7WX9", type: 80, lat: 57.2, lon: -2.1, speed: 11.8, heading: 90, destination: "HAMBURG", length: 225 },
  { mmsi: "636019782", name: "ATLANTIC STAR", callsign: "A8KL4", type: 70, lat: 42.3, lon: -65.8, speed: 15.5, heading: 75, destination: "ANTWERP", length: 300 },
  // Pacific routes
  { mmsi: "477307901", name: "COSCO SHIPPING", callsign: "VRQN2", type: 70, lat: 35.5, lon: 130.2, speed: 13.8, heading: 95, destination: "LONG BEACH", length: 366 },
  { mmsi: "563012345", name: "PACIFIC VOYAGER", callsign: "9V2KL", type: 70, lat: 22.3, lon: 114.5, speed: 12.0, heading: 180, destination: "SINGAPORE", length: 290 },
  { mmsi: "431000001", name: "NYK BLUE JAY", callsign: "7JBK", type: 70, lat: 34.7, lon: 137.8, speed: 14.5, heading: 270, destination: "YOKOHAMA", length: 338 },
  // Tankers
  { mmsi: "636015815", name: "CRUDE CARRIER", callsign: "A8MN5", type: 80, lat: 26.5, lon: 56.8, speed: 10.2, heading: 225, destination: "ROTTERDAM", length: 330 },
  { mmsi: "477307902", name: "LNG PIONEER", callsign: "VRQP3", type: 80, lat: 1.5, lon: 104.2, speed: 11.5, heading: 45, destination: "TOKYO", length: 295 },
  { mmsi: "255805961", name: "SUEZ TANKER", callsign: "CQHC", type: 80, lat: 30.1, lon: 32.5, speed: 9.8, heading: 330, destination: "GENOVA", length: 275 },
  // Passenger / Cruise
  { mmsi: "215678901", name: "SYMPHONY OF SEAS", callsign: "9HMK2", type: 60, lat: 25.8, lon: -80.1, speed: 18.5, heading: 135, destination: "COZUMEL", length: 362 },
  { mmsi: "311012345", name: "CARNIVAL DREAM", callsign: "C6XY3", type: 60, lat: 18.5, lon: -66.1, speed: 16.0, heading: 200, destination: "NASSAU", length: 306 },
  // Military / Coast Guard
  { mmsi: "338123456", name: "USS ARLEIGH BURKE", callsign: "NKJH", type: 35, lat: 36.8, lon: -76.3, speed: 20.0, heading: 90, destination: "NORFOLK", length: 155 },
  { mmsi: "338234567", name: "USCGC BERTHOLF", callsign: "NKJK", type: 55, lat: 37.8, lon: -122.5, speed: 15.0, heading: 270, destination: "SAN FRANCISCO", length: 127 },
  // Fishing
  { mmsi: "257123456", name: "NORDKAPP", callsign: "LKQP", type: 30, lat: 70.5, lon: 25.8, speed: 6.5, heading: 45, destination: "TROMSO", length: 65 },
  { mmsi: "503123456", name: "SOUTHERN STAR", callsign: "VJK23", type: 30, lat: -43.5, lon: 147.5, speed: 7.2, heading: 180, destination: "HOBART", length: 45 },
  // Mediterranean
  { mmsi: "247123456", name: "COSTA VENEZIA", callsign: "IBKL", type: 60, lat: 43.8, lon: 7.8, speed: 14.0, heading: 180, destination: "CIVITAVECCHIA", length: 323 },
  { mmsi: "229123456", name: "VALLETTA TRADER", callsign: "9HJK", type: 70, lat: 35.9, lon: 14.5, speed: 11.0, heading: 90, destination: "PIRAEUS", length: 185 },
  // Indian Ocean
  { mmsi: "419123456", name: "MUMBAI EXPRESS", callsign: "ATJK", type: 70, lat: 18.9, lon: 72.8, speed: 12.8, heading: 225, destination: "COLOMBO", length: 260 },
  { mmsi: "403123456", name: "ARABIAN GULF", callsign: "HZJK", type: 80, lat: 24.5, lon: 58.5, speed: 10.5, heading: 135, destination: "MUMBAI", length: 240 },
];

const vesselTrails = new Map<string, number[][]>();
let liveVessels = new Map<string, Vessel>();
let demoVessels: Vessel[] = [];
let usingDemo = false;

function buildDemoVessels(): Vessel[] {
  const now = new Date().toISOString();
  return DEMO_VESSELS.map(v => {
    const mmsi = v.mmsi;
    const pos: number[] = [v.lon + (Math.random() - 0.5) * 0.2, v.lat + (Math.random() - 0.5) * 0.2, v.speed];
    const existing = vesselTrails.get(mmsi) ?? [];
    const trail = [...existing, pos].slice(-20);
    vesselTrails.set(mmsi, trail);
    return {
      mmsi,
      name: v.name,
      callsign: v.callsign,
      flag: getFlagFromMMSI(mmsi),
      type: v.type,
      typeName: getVesselTypeName(v.type),
      typeCategory: getVesselCategory(v.type),
      latitude: pos[1],
      longitude: pos[0],
      speed: v.speed + (Math.random() - 0.5) * 2,
      heading: (v.heading + (Math.random() - 0.5) * 10 + 360) % 360,
      course: v.heading,
      status: 0,
      statusName: "Underway (Engine)",
      destination: v.destination,
      draught: 8 + Math.random() * 10,
      length: v.length,
      width: Math.round(v.length * 0.15),
      trail,
      last_seen: now,
      source: "demo",
    };
  });
}

// ─── AISStream WebSocket connection ──────────────────────────────────────────

function connectAISStream(apiKey: string, manager: WorldViewManager): void {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    try {
      ws = new WebSocket(AISSTREAM_WS);

      ws.on("open", () => {
        console.log("[MaritimeWorker] Connected to AISStream");
        usingDemo = false;
        const subscription = {
          APIKey: apiKey,
          BoundingBoxes: [
            [[-90, -180], [90, 180]], // Global
          ],
          FilterMessageTypes: ["PositionReport", "ShipStaticData"],
        };
        ws!.send(JSON.stringify(subscription));
        manager.updateFeedStatus("maritime", {
          status: "live",
          detail: "AISStream WebSocket connected",
          itemCount: liveVessels.size,
        });
      });

      ws.on("message", (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.error) {
            console.warn("[MaritimeWorker] AISStream error:", msg.error);
            return;
          }
          const mmsi = String(msg.Metadata?.MMSI ?? "");
          if (!mmsi) return;

          if (msg.MessageType === "PositionReport") {
            const pr = msg.Message?.PositionReport;
            if (!pr) return;
            const lat = msg.Metadata?.latitude ?? pr.Latitude;
            const lon = msg.Metadata?.longitude ?? pr.Longitude;
            if (typeof lat !== "number" || typeof lon !== "number") return;

            const pos: number[] = [lon, lat, pr.Sog ?? 0];
            const existing = vesselTrails.get(mmsi) ?? [];
            const trail = [...existing, pos].slice(-20);
            vesselTrails.set(mmsi, trail);

            const existing_vessel = liveVessels.get(mmsi);
            const vessel: Vessel = {
              mmsi,
              name: msg.Metadata?.ShipName ?? existing_vessel?.name ?? mmsi,
              callsign: existing_vessel?.callsign ?? "",
              flag: getFlagFromMMSI(mmsi),
              type: existing_vessel?.type ?? 0,
              typeName: existing_vessel?.typeName ?? "Unknown",
              typeCategory: existing_vessel?.typeCategory ?? "other",
              latitude: lat,
              longitude: lon,
              speed: pr.Sog ?? null,
              heading: pr.TrueHeading !== 511 ? pr.TrueHeading : null,
              course: pr.Cog ?? null,
              status: pr.NavigationalStatus ?? null,
              statusName: getNavStatusName(pr.NavigationalStatus ?? null),
              destination: existing_vessel?.destination ?? "",
              draught: existing_vessel?.draught ?? null,
              length: existing_vessel?.length ?? null,
              width: existing_vessel?.width ?? null,
              trail,
              last_seen: new Date().toISOString(),
              source: "aisstream",
            };
            liveVessels.set(mmsi, vessel);

            // Cap at MAX_VESSELS
            if (liveVessels.size > MAX_VESSELS) {
              const oldest = Array.from(liveVessels.keys())[0];
              liveVessels.delete(oldest);
            }
          } else if (msg.MessageType === "ShipStaticData") {
            const sd = msg.Message?.ShipStaticData;
            if (!sd) return;
            const existing_vessel = liveVessels.get(mmsi);
            if (existing_vessel) {
              const updated: Vessel = {
                ...existing_vessel,
                name: sd.Name?.trim() || existing_vessel.name,
                callsign: sd.CallSign?.trim() || existing_vessel.callsign,
                type: sd.Type ?? existing_vessel.type,
                typeName: getVesselTypeName(sd.Type ?? existing_vessel.type),
                typeCategory: getVesselCategory(sd.Type ?? existing_vessel.type),
                destination: sd.Destination?.trim() || existing_vessel.destination,
                draught: sd.MaximumStaticDraught ?? existing_vessel.draught,
                length: sd.Dimension?.A != null && sd.Dimension?.B != null
                  ? (sd.Dimension.A + sd.Dimension.B)
                  : existing_vessel.length,
                width: sd.Dimension?.C != null && sd.Dimension?.D != null
                  ? (sd.Dimension.C + sd.Dimension.D)
                  : existing_vessel.width,
              };
              liveVessels.set(mmsi, updated);
            }
          }

          // Broadcast update every 50 new messages or on static data
          if (liveVessels.size % 50 === 0 || msg.MessageType === "ShipStaticData") {
            const payload = Array.from(liveVessels.values()).slice(0, MAX_VESSELS);
            // Feed history buffer + anomaly detection
            getHistoryBuffer().updateVessels(payload.map(v => ({
              mmsi: v.mmsi,
              name: v.name,
              lat: v.latitude,
              lon: v.longitude,
              speed: v.speed,
              heading: v.heading,
              typeCategory: v.typeCategory,
              flag: v.flag,
            })));
            const newAnomalies = analyzeVessels(payload.map(v => ({
              mmsi: v.mmsi,
              name: v.name,
              latitude: v.latitude,
              longitude: v.longitude,
              speed: v.speed,
              typeCategory: v.typeCategory,
            })));
            if (newAnomalies.length > 0) {
              manager.broadcast("anomaly_updates", newAnomalies);
            }
        manager.broadcast("vessel_updates", payload);
            manager.updateFeedStatus("maritime", {
              status: "live",
              detail: `AISStream: ${liveVessels.size} vessels`,
              itemCount: liveVessels.size,
            });
          }
        } catch {
          // ignore parse errors
        }
      });

      ws.on("close", () => {
        console.log("[MaritimeWorker] AISStream disconnected, reconnecting...");
        usingDemo = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
        manager.updateFeedStatus("maritime", {
          status: "degraded",
          detail: "AISStream disconnected — reconnecting",
          itemCount: liveVessels.size,
        });
      });

      ws.on("error", (err: Error) => {
        console.error("[MaritimeWorker] AISStream error:", err.message);
        usingDemo = true;
      });
    } catch (err) {
      console.error("[MaritimeWorker] Failed to connect:", err);
      usingDemo = true;
    }
  };

  connect();
}

// ─── Demo mode broadcaster ────────────────────────────────────────────────────

function startDemoMode(manager: WorldViewManager): void {
  console.log("[MaritimeWorker] Running in demo mode (no AISSTREAM_API_KEY set)");
  usingDemo = true;

  const broadcast = () => {
    demoVessels = buildDemoVessels();
    // Feed history buffer + anomaly detection
    getHistoryBuffer().updateVessels(demoVessels.map(v => ({
      mmsi: v.mmsi,
      name: v.name,
      lat: v.latitude,
      lon: v.longitude,
      speed: v.speed,
      heading: v.heading,
      typeCategory: v.typeCategory,
      flag: v.flag,
    })));
    const newAnomalies = analyzeVessels(demoVessels.map(v => ({
      mmsi: v.mmsi,
      name: v.name,
      latitude: v.latitude,
      longitude: v.longitude,
      speed: v.speed,
      typeCategory: v.typeCategory,
    })));
    if (newAnomalies.length > 0) {
      manager.broadcast("anomaly_updates", newAnomalies);
    }
    manager.broadcast("vessel_updates", demoVessels);
    manager.updateFeedStatus("maritime", {
      status: "fallback",
      detail: `Demo mode: ${demoVessels.length} simulated vessels (set AISSTREAM_API_KEY for live data)`,
      itemCount: demoVessels.length,
    });
  };

  broadcast();
  setInterval(broadcast, 30_000);
}

// ─── Periodic broadcast for live mode ────────────────────────────────────────

function startLiveBroadcast(manager: WorldViewManager): void {
  setInterval(() => {
    if (!usingDemo && liveVessels.size > 0) {
      const payload = Array.from(liveVessels.values()).slice(0, MAX_VESSELS);
      manager.broadcast("vessel_updates", payload);
      manager.updateFeedStatus("maritime", {
        status: "live",
        detail: `AISStream: ${liveVessels.size} vessels`,
        itemCount: liveVessels.size,
      });
    }
  }, 15_000);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function startMaritimeWorker(manager: WorldViewManager): Promise<void> {
  const apiKey = process.env.AISSTREAM_API_KEY;

  if (apiKey && apiKey.trim().length > 0) {
    connectAISStream(apiKey.trim(), manager);
    startLiveBroadcast(manager);
  } else {
    startDemoMode(manager);
  }
}
