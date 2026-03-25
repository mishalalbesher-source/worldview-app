import { lazy, Suspense, useEffect } from "react";
import { useWorldViewSocket } from "@/hooks/useWorldViewSocket";
import useStore from "@/store/useStore";
import {
  Plane, Satellite, Globe, Camera, Activity, Wifi, WifiOff,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Layers, Eye, EyeOff,
  AlertTriangle, Thermometer, Wind, Cloud, Zap, MapPin, X,
  Ruler, Trash2, RotateCcw, Shield, Users, ScanLine, Target,
  Sun, Moon
} from "lucide-react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import type { RulerUnit } from "@/store/useStore";

const CesiumViewer = lazy(() => import("@/components/globe/CesiumViewer"));

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatNum(val: number | null | undefined, suffix = "", decimals = 0): string {
  if (val == null || !isFinite(val)) return "—";
  return val.toFixed(decimals) + suffix;
}

function toRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatRulerDistance(km: number, unit: RulerUnit): string {
  if (unit === "nm") return `${(km * 0.539957).toFixed(1)} NM`;
  if (unit === "mi") return `${(km * 0.621371).toFixed(1)} mi`;
  return km >= 1000 ? `${(km / 1000).toFixed(2)} Mm` : `${km.toFixed(1)} km`;
}

// ─── Status Dot ───────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const color =
    status === "live" ? "bg-emerald-400"
    : status === "degraded" ? "bg-amber-400"
    : status === "fallback" ? "bg-sky-400"
    : status === "error" ? "bg-rose-500"
    : "bg-slate-500";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color} live-pulse shrink-0`} />;
}

// ─── Connection Badge ─────────────────────────────────────────────────────────
function ConnectionBadge() {
  const status = useStore(s => s.status);
  const lastMessageAt = useStore(s => s.lastMessageAt);
  const isConnected = status === "connected";
  return (
    <div className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold tracking-widest uppercase border ${
      isConnected
        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
        : "bg-rose-500/10 border-rose-500/30 text-rose-400"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-400 live-pulse" : "bg-rose-400"}`} />
      {isConnected ? "Live" : status}
      {lastMessageAt && <span className="opacity-50 font-normal normal-case tracking-normal">{toRelativeTime(lastMessageAt)}</span>}
    </div>
  );
}

// ─── Operational Panel ────────────────────────────────────────────────────────
function OpPanel({ title, icon: Icon, accentColor, children, className = "" }: {
  title: string; icon: any; accentColor: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`flex flex-col op-panel overflow-hidden ${className}`}>
      <div className="op-panel-header" style={{ color: accentColor, borderColor: `${accentColor}22` }}>
        <Icon style={{ color: accentColor }} className="h-3 w-3 shrink-0" />
        <span style={{ color: accentColor }}>{title}</span>
      </div>
      <div className="flex-1 overflow-hidden p-2.5">{children}</div>
    </div>
  );
}

// ─── Layer Toggle ─────────────────────────────────────────────────────────────
function LayerToggle({ layerKey, label, icon: Icon, accentColor }: {
  layerKey: string; label: string; icon: any; accentColor: string;
}) {
  const layers = useStore(s => s.layers);
  const updateLayer = useStore(s => s.updateLayer);
  const layer = layers[layerKey as keyof typeof layers];
  const isVisible = layer?.visible ?? true;

  return (
    <button
      className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider border transition-all"
      style={isVisible
        ? { background: `${accentColor}15`, borderColor: `${accentColor}40`, color: accentColor }
        : { background: "transparent", borderColor: "rgba(255,255,255,0.08)", color: "rgba(148,163,184,0.6)" }
      }
      onClick={() => updateLayer(layerKey as any, { visible: !isVisible })}
    >
      {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

// ─── Feed Status Panel ────────────────────────────────────────────────────────
function FeedStatusPanel() {
  const feedStatus = useStore(s => s.feedStatus);
  const entries = Object.values(feedStatus);
  return (
    <div className="space-y-1">
      {entries.length === 0 ? (
        <div className="data-label text-slate-500 py-2">Awaiting feed data...</div>
      ) : entries.map(f => (
        <div key={f.source} className="flex items-center gap-2 rounded px-2 py-1.5" style={{ background: "rgba(255,255,255,0.03)" }}>
          <StatusDot status={f.status} />
          <span className="flex-1 data-label text-slate-300 capitalize">{f.source}</span>
          <span className="data-label text-slate-500">{f.itemCount}</span>
          <span className={`data-label uppercase tracking-wider ${
            f.status === "live" ? "text-emerald-400"
            : f.status === "degraded" ? "text-amber-400"
            : f.status === "fallback" ? "text-sky-400"
            : "text-rose-400"
          }`}>{f.status}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Aircraft List ────────────────────────────────────────────────────────────
function AircraftList() {
  const aircraft = useStore(s => s.aircraft);
  const setSelectedEntity = useStore(s => s.setSelectedEntity);
  const search = useStore(s => s.filters.globalSearch);
  const classFilter = useStore(s => s.filters.aircraft.classFilter);
  const setAircraftClassFilter = useStore(s => s.setAircraftClassFilter);

  const filtered = aircraft
    .filter(a => {
      if (search && !a.callsign?.toLowerCase().includes(search.toLowerCase()) && !a.country?.toLowerCase().includes(search.toLowerCase())) return false;
      if (classFilter === "military" && a.aircraftClass !== "military") return false;
      if (classFilter === "civilian" && a.aircraftClass !== "civilian") return false;
      return true;
    })
    .slice(0, 80);

  const militaryCount = aircraft.filter(a => a.aircraftClass === "military").length;
  const civilianCount = aircraft.filter(a => a.aircraftClass === "civilian").length;

  return (
    <div className="flex flex-col gap-2">
      {/* Classification filter */}
      <div className="flex items-center gap-1.5">
        {[
          { key: "all", label: `All (${aircraft.length})`, color: "rgba(148,163,184,0.8)" },
          { key: "military", label: `MIL (${militaryCount})`, color: "#f97316" },
          { key: "civilian", label: `CIV (${civilianCount})`, color: "#67e8f9" },
        ].map(opt => (
          <button
            key={opt.key}
            className="flex-1 rounded px-1.5 py-1 data-label uppercase tracking-wider border transition-all"
            style={classFilter === opt.key
              ? { background: `${opt.color}18`, borderColor: `${opt.color}50`, color: opt.color }
              : { background: "transparent", borderColor: "rgba(255,255,255,0.06)", color: "rgba(148,163,184,0.5)" }
            }
            onClick={() => setAircraftClassFilter(opt.key as any)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Aircraft rows */}
      <div className="space-y-0.5 max-h-56 overflow-y-auto op-scroll pr-0.5">
        {filtered.length === 0 ? (
          <div className="py-4 text-center data-label text-slate-500">No aircraft match filters</div>
        ) : filtered.map(a => {
          const isMilitary = a.aircraftClass === "military";
          const accentColor = isMilitary ? "#f97316" : "#67e8f9";
          return (
            <button
              key={a.id}
              className="w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-left transition-all border border-transparent"
              style={{ background: "rgba(255,255,255,0.025)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${accentColor}30`; (e.currentTarget as HTMLElement).style.background = `${accentColor}08`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
              onClick={() => setSelectedEntity({ type: "aircraft", id: a.id })}
            >
              {isMilitary
                ? <Shield className="h-3 w-3 shrink-0" style={{ color: accentColor }} />
                : <Plane className="h-3 w-3 shrink-0" style={{ color: accentColor }} />
              }
              <div className="flex-1 min-w-0">
                <div className="data-value text-slate-200 truncate" style={{ fontSize: "0.72rem" }}>{a.callsign || a.id}</div>
                <div className="data-label text-slate-500 truncate">{a.country}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="data-label" style={{ color: accentColor }}>{formatNum(a.altitude ? a.altitude / 1000 : null, "km", 1)}</div>
                <div className="data-label text-slate-500">{formatNum(a.velocity, "m/s", 0)}</div>
              </div>
              {isMilitary && (
                <span className="badge-military shrink-0">{a.militarySubtype ?? "MIL"}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Satellite List ───────────────────────────────────────────────────────────
function SatelliteList() {
  const satellites = useStore(s => s.satellites);
  const setSelectedEntity = useStore(s => s.setSelectedEntity);
  return (
    <div className="space-y-0.5 max-h-64 overflow-y-auto op-scroll pr-0.5">
      {satellites.slice(0, 40).map(s => (
        <button
          key={s.id}
          className="w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-left transition-all border border-transparent"
          style={{ background: "rgba(255,255,255,0.025)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(251,191,36,0.3)"; (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.06)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
          onClick={() => setSelectedEntity({ type: "satellites", id: s.id })}
        >
          <Satellite className="h-3 w-3 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="data-value text-slate-200 truncate" style={{ fontSize: "0.72rem" }}>{s.name}</div>
            <div className="data-label text-slate-500 truncate">{s.category}</div>
          </div>
          <div className="data-label text-amber-400/80">{formatNum(s.altitude ? s.altitude / 1000 : null, "km", 0)}</div>
        </button>
      ))}
    </div>
  );
}

// ─── Earthquake List ──────────────────────────────────────────────────────────
function EarthquakeList() {
  const earthquakes = useStore(s => s.earthquakes);
  const minMag = useStore(s => s.filters.earthquakes.minMagnitude);
  const setSelectedEntity = useStore(s => s.setSelectedEntity);
  const filtered = earthquakes.filter(e => e.magnitude >= minMag).slice(0, 40);
  return (
    <div className="space-y-0.5 max-h-64 overflow-y-auto op-scroll pr-0.5">
      {filtered.length === 0 ? (
        <div className="py-4 text-center data-label text-slate-500">No quakes above M{minMag}</div>
      ) : filtered.map(q => {
        const color = q.magnitude >= 6 ? "#ef4444" : q.magnitude >= 4 ? "#f97316" : "#eab308";
        return (
          <button
            key={q.id}
            className="w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-left transition-all border border-transparent"
            style={{ background: "rgba(255,255,255,0.025)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${color}30`; (e.currentTarget as HTMLElement).style.background = `${color}08`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
            onClick={() => setSelectedEntity({ type: "earthquakes", id: q.id })}
          >
            <div className="h-6 w-6 rounded flex items-center justify-center data-value shrink-0" style={{ background: `${color}20`, color, fontSize: "0.65rem" }}>
              {q.magnitude.toFixed(1)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="data-value text-slate-200 truncate" style={{ fontSize: "0.72rem" }}>{q.place}</div>
              <div className="data-label text-slate-500">{toRelativeTime(q.time)}</div>
            </div>
            {q.tsunami && <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

// ─── Webcam List ──────────────────────────────────────────────────────────────
function WebcamList() {
  const webcams = useStore(s => s.webcams);
  const setSelectedEntity = useStore(s => s.setSelectedEntity);
  return (
    <div className="space-y-0.5 max-h-64 overflow-y-auto op-scroll pr-0.5">
      {webcams.map(w => (
        <button
          key={w.id}
          className="w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-left transition-all border border-transparent"
          style={{ background: "rgba(255,255,255,0.025)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(74,222,128,0.3)"; (e.currentTarget as HTMLElement).style.background = "rgba(74,222,128,0.06)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
          onClick={() => setSelectedEntity({ type: "webcams", id: w.id })}
        >
          <Camera className="h-3 w-3 text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="data-value text-slate-200 truncate" style={{ fontSize: "0.72rem" }}>{w.name}</div>
            <div className="data-label text-slate-500 truncate">{w.region}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Weather Panel ────────────────────────────────────────────────────────────
function WeatherPanel() {
  const weatherSummary = useStore(s => s.weatherSummary);
  const alerts = useStore(s => s.alerts);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {weatherSummary.slice(0, 6).map(w => (
          <div key={w.id} className="rounded p-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between">
              <span className="data-value text-slate-200" style={{ fontSize: "0.7rem" }}>{w.name}</span>
              <span className="data-label text-slate-500">{w.region}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <Thermometer className="h-2.5 w-2.5 text-orange-400" />
              <span className="data-value text-slate-100" style={{ fontSize: "0.8rem" }}>{formatNum(w.temperature, "°C", 1)}</span>
              <span className="data-label text-slate-400 ml-auto">{w.condition}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 data-label text-slate-500">
              <Wind className="h-2 w-2" />
              {formatNum(w.windSpeed, " km/h", 0)}
            </div>
          </div>
        ))}
      </div>
      {alerts.length > 0 && (
        <div className="space-y-1">
          <div className="data-label uppercase tracking-widest text-amber-400">Active Alerts ({alerts.length})</div>
          {alerts.slice(0, 3).map(a => (
            <div key={a.id} className="rounded px-2.5 py-2" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <div className="flex items-center gap-2">
                <Zap className="h-3 w-3 text-amber-400" />
                <span className="data-value text-slate-200" style={{ fontSize: "0.72rem" }}>{a.event}</span>
                <span className="ml-auto data-label text-amber-300">{a.severity}</span>
              </div>
              <div className="mt-0.5 data-label text-slate-500">{a.area}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Entity Detail Panel ──────────────────────────────────────────────────────
function EntityDetailPanel() {
  const selectedEntity = useStore(s => s.selectedEntity);
  const clearSelection = useStore(s => s.clearSelection);
  const aircraft = useStore(s => s.aircraft);
  const satellites = useStore(s => s.satellites);
  const webcams = useStore(s => s.webcams);
  const earthquakes = useStore(s => s.earthquakes);

  if (!selectedEntity) return (
    <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2 py-8">
      <Target className="h-8 w-8 opacity-20" />
      <span className="data-label text-slate-600">Click any entity on the globe</span>
    </div>
  );

  const dataMap: Record<string, any[]> = { aircraft, satellites, webcams, earthquakes };
  const item = dataMap[selectedEntity.type]?.find((i: any) => i.id === selectedEntity.id);
  if (!item) return null;

  const renderDetail = () => {
    if (selectedEntity.type === "aircraft") {
      const a = item;
      const isMilitary = a.aircraftClass === "military";
      const accentColor = isMilitary ? "#f97316" : "#67e8f9";
      return (
        <div className="space-y-2.5">
          <div className="flex items-start gap-2">
            <div>
              <div className="data-value text-lg" style={{ color: accentColor }}>{a.callsign || a.id}</div>
              <div className="data-label text-slate-400">{a.country}</div>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1">
              {isMilitary
                ? <span className="badge-military">{a.militarySubtype ?? "MIL"}</span>
                : <span className="badge-civilian">CIV</span>
              }
              {a.onGround && <span className="data-label text-amber-400">ON GROUND</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              ["ALT", formatNum(a.altitude ? a.altitude / 1000 : null, " km", 1)],
              ["SPD", formatNum(a.velocity, " m/s", 0)],
              ["HDG", formatNum(a.heading, "°", 0)],
              ["VRT", formatNum(a.verticalRate, " m/s", 1)],
              ["LAT", formatNum(a.latitude, "°", 3)],
              ["LON", formatNum(a.longitude, "°", 3)],
            ].map(([k, v]) => (
              <div key={k} className="rounded p-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="data-label text-slate-500">{k}</div>
                <div className="data-value" style={{ color: accentColor }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="data-label text-slate-600">ICAO24: {a.id} · {a.source}</div>
        </div>
      );
    }
    if (selectedEntity.type === "satellites") {
      const s = item;
      return (
        <div className="space-y-2.5">
          <div>
            <div className="data-value text-base text-amber-300">{s.name}</div>
            <div className="data-label text-slate-400">{s.category}</div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              ["ALT", formatNum(s.altitude ? s.altitude / 1000 : null, " km", 0)],
              ["LAT", formatNum(s.latitude, "°", 2)],
              ["LON", formatNum(s.longitude, "°", 2)],
              ["SRC", s.source],
            ].map(([k, v]) => (
              <div key={k} className="rounded p-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="data-label text-slate-500">{k}</div>
                <div className="data-value text-amber-300">{v}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (selectedEntity.type === "earthquakes") {
      const q = item;
      const color = q.magnitude >= 6 ? "#ef4444" : q.magnitude >= 4 ? "#f97316" : "#eab308";
      return (
        <div className="space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="data-value text-3xl" style={{ color }}>{q.magnitude.toFixed(1)}</div>
            <div>
              <div className="data-label text-slate-300" style={{ fontSize: "0.75rem" }}>{q.place}</div>
              <div className="data-label text-slate-500">{toRelativeTime(q.time)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              ["DEPTH", formatNum(q.depthKm, " km", 1)],
              ["SIG", String(q.significance)],
              ["FELT", String(q.felt || 0)],
              ["STATUS", q.status],
            ].map(([k, v]) => (
              <div key={k} className="rounded p-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="data-label text-slate-500">{k}</div>
                <div className="data-value" style={{ color }}>{v}</div>
              </div>
            ))}
          </div>
          {q.tsunami && (
            <div className="flex items-center gap-1.5 rounded px-2.5 py-2" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              <span className="data-label text-amber-300 uppercase tracking-wider">Tsunami Warning</span>
            </div>
          )}
          {q.url && (
            <a href={q.url} target="_blank" rel="noreferrer" className="data-label text-sky-400 hover:text-sky-300 transition-colors">
              View on USGS →
            </a>
          )}
        </div>
      );
    }
    if (selectedEntity.type === "webcams") {
      const w = item;
      return (
        <div className="space-y-2">
          <div>
            <div className="data-value text-emerald-300" style={{ fontSize: "0.85rem" }}>{w.name}</div>
            <div className="data-label text-slate-400">{w.region} · {w.park}</div>
          </div>
          <img
            src={w.proxySnapshotUrl}
            alt={w.name}
            className="w-full rounded border object-cover"
            style={{ maxHeight: 160, borderColor: "rgba(74,222,128,0.2)" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="data-label text-slate-500">{w.description}</div>
          <a href={w.externalUrl} target="_blank" rel="noreferrer" className="data-label text-sky-400 hover:text-sky-300 transition-colors">
            Open live feed →
          </a>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative">
      <button
        className="absolute right-0 top-0 rounded p-0.5 text-slate-600 hover:text-slate-300 transition-colors"
        onClick={clearSelection}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {renderDetail()}
    </div>
  );
}

// ─── Ruler Panel ──────────────────────────────────────────────────────────────
function RulerPanel() {
  const ruler = useStore(s => s.ruler);
  const toggleRuler = useStore(s => s.toggleRuler);
  const clearRuler = useStore(s => s.clearRuler);
  const removeLastRulerPoint = useStore(s => s.removeLastRulerPoint);
  const setRulerUnit = useStore(s => s.setRulerUnit);

  const AMBER = "#f59e0b";

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex items-center gap-1.5">
        <button
          className="flex-1 flex items-center justify-center gap-1.5 rounded px-2.5 py-1.5 data-label uppercase tracking-wider border transition-all"
          style={ruler.active
            ? { background: `${AMBER}18`, borderColor: `${AMBER}50`, color: AMBER }
            : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(148,163,184,0.8)" }
          }
          onClick={toggleRuler}
        >
          <Ruler className="h-3 w-3" />
          {ruler.active ? "MEASURING" : "MEASURE"}
        </button>
        <button
          className="rounded px-2 py-1.5 data-label border border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20 transition-all"
          onClick={removeLastRulerPoint}
          disabled={ruler.points.length === 0}
          title="Undo last point"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
        <button
          className="rounded px-2 py-1.5 data-label border border-white/10 text-slate-500 hover:text-rose-400 hover:border-rose-500/30 transition-all"
          onClick={clearRuler}
          disabled={ruler.points.length === 0}
          title="Clear ruler"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Unit selector */}
      <div className="flex items-center gap-1">
        {(["km", "nm", "mi"] as RulerUnit[]).map(u => (
          <button
            key={u}
            className="flex-1 rounded px-1.5 py-1 data-label uppercase tracking-wider border transition-all"
            style={ruler.unit === u
              ? { background: `${AMBER}18`, borderColor: `${AMBER}40`, color: AMBER }
              : { background: "transparent", borderColor: "rgba(255,255,255,0.06)", color: "rgba(148,163,184,0.5)" }
            }
            onClick={() => setRulerUnit(u)}
          >
            {u}
          </button>
        ))}
      </div>

      {/* Distance readout */}
      {ruler.points.length >= 2 ? (
        <div className="rounded p-2.5 space-y-1.5" style={{ background: `${AMBER}08`, border: `1px solid ${AMBER}25` }}>
          <div className="flex items-center justify-between">
            <span className="data-label text-slate-400 uppercase tracking-wider">Total Distance</span>
            <span className="data-value text-lg" style={{ color: AMBER }}>
              {formatRulerDistance(ruler.totalDistance, ruler.unit)}
            </span>
          </div>
          {ruler.segmentDistances.length > 1 && (
            <div className="space-y-0.5 border-t pt-1.5" style={{ borderColor: `${AMBER}20` }}>
              {ruler.segmentDistances.map((d, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="data-label text-slate-500">Seg {i + 1}</span>
                  <span className="data-label" style={{ color: `${AMBER}cc` }}>{formatRulerDistance(d, ruler.unit)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="data-label text-slate-600 text-center py-1">
          {ruler.active ? "Click on globe to place points" : "Activate to measure distances"}
        </div>
      )}

      {ruler.active && (
        <div className="data-label text-amber-400/70 text-center">
          {ruler.points.length === 0 ? "Click to set start point" : `${ruler.points.length} point${ruler.points.length > 1 ? "s" : ""} placed`}
        </div>
      )}
    </div>
  );
}

// ─── Analytics Panel ──────────────────────────────────────────────────────────
function AnalyticsPanel() {
  const aircraft = useStore(s => s.aircraft);
  const earthquakes = useStore(s => s.earthquakes);

  const topAircraft = [...aircraft]
    .filter(a => a.velocity && a.velocity > 0)
    .sort((a, b) => (b.velocity ?? 0) - (a.velocity ?? 0))
    .slice(0, 6)
    .map(a => ({
      name: a.callsign?.slice(0, 6) || a.id.slice(0, 6),
      speed: Math.round(a.velocity ?? 0),
      fill: a.aircraftClass === "military" ? "#f97316" : "#67e8f9",
    }));

  const recentQuakes = [...earthquakes]
    .sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""))
    .slice(0, 8)
    .map((q, i) => ({ name: `#${i + 1}`, magnitude: q.magnitude }));

  const militaryCount = aircraft.filter(a => a.aircraftClass === "military").length;
  const civilianCount = aircraft.filter(a => a.aircraftClass === "civilian").length;
  const unknownCount = aircraft.length - militaryCount - civilianCount;

  const classPie = [
    { name: "Military", value: militaryCount, fill: "#f97316" },
    { name: "Civilian", value: civilianCount, fill: "#67e8f9" },
    { name: "Unknown", value: unknownCount, fill: "#475569" },
  ].filter(d => d.value > 0);

  const tooltipStyle = {
    background: "oklch(0.155 0.010 240)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "4px",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    color: "#94a3b8",
  };

  return (
    <div className="grid grid-cols-3 gap-2 h-full">
      {/* Fastest aircraft */}
      <div className="rounded p-2.5 flex flex-col" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-1.5 mb-2 data-label uppercase tracking-wider text-slate-400">
          <Plane className="h-2.5 w-2.5" /> Fastest
        </div>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={topAircraft} margin={{ left: -22, right: 4, top: 4, bottom: 20 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.06)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }} angle={-20} height={30} />
            <YAxis tick={{ fill: "#64748b", fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }} width={28} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="speed" radius={[2, 2, 0, 0]}>
              {topAircraft.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent quakes */}
      <div className="rounded p-2.5 flex flex-col" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-1.5 mb-2 data-label uppercase tracking-wider text-slate-400">
          <AlertTriangle className="h-2.5 w-2.5" /> Quakes
        </div>
        <ResponsiveContainer width="100%" height={130}>
          <AreaChart data={recentQuakes} margin={{ left: -22, right: 4, top: 4, bottom: 20 }}>
            <defs>
              <linearGradient id="qFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.06)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }} />
            <YAxis tick={{ fill: "#64748b", fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }} width={28} domain={[0, 9]} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area dataKey="magnitude" fill="url(#qFill)" stroke="#ef4444" strokeWidth={1.5} type="monotone" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Aircraft classification pie */}
      <div className="rounded p-2.5 flex flex-col" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-1.5 mb-2 data-label uppercase tracking-wider text-slate-400">
          <Shield className="h-2.5 w-2.5" /> Class
        </div>
        <ResponsiveContainer width="100%" height={100}>
          <PieChart>
            <Pie data={classPie} cx="50%" cy="50%" innerRadius={28} outerRadius={44} paddingAngle={2} dataKey="value">
              {classPie.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-1 space-y-0.5">
          {classPie.map(d => (
            <div key={d.name} className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: d.fill }} />
              <span className="data-label text-slate-400 flex-1">{d.name}</span>
              <span className="data-label" style={{ color: d.fill }}>{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main WorldView Page ──────────────────────────────────────────────────────
export default function WorldView() {
  useWorldViewSocket();

  const { panels, togglePanel, activeTab, setActiveTab, aircraft, satellites, earthquakes, webcams } = useStore();
  const layers = useStore(s => s.layers);
  const updateLayer = useStore(s => s.updateLayer);
  const setVisualMode = useStore(s => s.setVisualMode);
  const setImageryPreset = useStore(s => s.setImageryPreset);
  const visualMode = useStore(s => s.visualMode);
  const imageryPreset = useStore(s => s.imageryPreset);
  const globalSearch = useStore(s => s.filters.globalSearch);
  const setGlobalSearch = useStore(s => s.setGlobalSearch);
  const minMag = useStore(s => s.filters.earthquakes.minMagnitude);
  const setMinMagnitude = useStore(s => s.setMinMagnitude);
  const theme = useStore(s => s.theme);
  const toggleTheme = useStore(s => s.toggleTheme);
  const ruler = useStore(s => s.ruler);

  useEffect(() => {
    document.title = "WorldView — Operational Earth Dashboard";
  }, []);

  const AMBER = "#f59e0b";
  const CYAN = "#67e8f9";

  const tabs = [
    { key: "aircraft", label: "Aircraft", icon: Plane, count: aircraft.length, color: CYAN },
    { key: "satellites", label: "Sats", icon: Satellite, count: satellites.length, color: "#fbbf24" },
    { key: "earthquakes", label: "Quakes", icon: AlertTriangle, count: earthquakes.length, color: "#ef4444" },
    { key: "webcams", label: "Cams", icon: Camera, count: webcams.length, color: "#4ade80" },
    { key: "weather", label: "Weather", icon: Cloud, count: 0, color: "#7dd3fc" },
  ] as const;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden grid-bg" style={{ background: "oklch(0.115 0.010 240)", color: "oklch(0.88 0.006 240)", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2 shrink-0 z-20" style={{ background: "oklch(0.14 0.009 240 / 0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Globe className="h-5 w-5" style={{ color: AMBER }} />
            {ruler.active && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 live-pulse" />
            )}
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight" style={{ color: "oklch(0.92 0.006 240)", fontFamily: "'Space Grotesk', sans-serif" }}>WorldView</div>
            <div className="data-label text-slate-500 hidden sm:block">OPERATIONAL EARTH DASHBOARD</div>
          </div>
        </div>

        <div className="flex-1" />

        {/* Ruler mode indicator */}
        {ruler.active && (
          <div className="flex items-center gap-1.5 rounded px-2.5 py-1 data-label uppercase tracking-wider" style={{ background: `${AMBER}15`, border: `1px solid ${AMBER}40`, color: AMBER }}>
            <Ruler className="h-3 w-3" />
            RULER ACTIVE
            {ruler.totalDistance > 0 && <span className="font-normal normal-case tracking-normal">{ruler.totalDistance.toFixed(1)} km</span>}
          </div>
        )}

        {/* Imagery preset */}
        <select
          className="rounded px-2 py-1 data-label border focus:outline-none transition-colors"
          style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(148,163,184,0.9)" }}
          value={imageryPreset}
          onChange={e => setImageryPreset(e.target.value as any)}
        >
          <option value="osm">Street Map</option>
          <option value="dark">Dark Carto</option>
          <option value="ion">Natural Earth</option>
        </select>

        {/* Visual mode */}
        <select
          className="rounded px-2 py-1 data-label border focus:outline-none transition-colors"
          style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(148,163,184,0.9)" }}
          value={visualMode}
          onChange={e => setVisualMode(e.target.value as any)}
        >
          <option value="normal">Normal</option>
          <option value="green">NV Green</option>
          <option value="mono">Mono</option>
        </select>

        {/* Theme toggle */}
        <button
          className="rounded p-1.5 border transition-all"
          style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)", color: "rgba(148,163,184,0.7)" }}
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <ConnectionBadge />
      </header>

      {/* ── Main Layout ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Left Panel */}
        {panels.left && (
          <aside className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto op-scroll p-2 z-10" style={{ background: "oklch(0.13 0.009 240 / 0.85)", borderRight: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(8px)" }}>

            {/* Search */}
            <div className="relative">
              <ScanLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
              <input
                className="w-full rounded px-3 py-2 pl-8 data-label border focus:outline-none transition-colors"
                style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)", color: "rgba(203,213,225,0.9)" }}
                placeholder="Search callsign, country..."
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
              />
            </div>

            {/* Layers */}
            <OpPanel title="Layers" icon={Layers} accentColor={CYAN}>
              <div className="flex flex-wrap gap-1.5">
                <LayerToggle layerKey="aircraft" label="Aircraft" icon={Plane} accentColor={CYAN} />
                <LayerToggle layerKey="satellites" label="Sats" icon={Satellite} accentColor="#fbbf24" />
                <LayerToggle layerKey="earthquakes" label="Quakes" icon={AlertTriangle} accentColor="#ef4444" />
                <LayerToggle layerKey="webcams" label="Cams" icon={Camera} accentColor="#4ade80" />
                <LayerToggle layerKey="weather" label="Weather" icon={Cloud} accentColor="#7dd3fc" />
              </div>
              <div className="mt-2 space-y-1.5">
                {layers.aircraft.visible && (
                  <label className="flex items-center gap-2 data-label text-slate-400 cursor-pointer">
                    <input type="checkbox" className="accent-cyan-400" checked={layers.aircraft.showTrails} onChange={e => updateLayer("aircraft", { showTrails: e.target.checked })} />
                    Show flight trails
                  </label>
                )}
                {layers.aircraft.visible && (
                  <label className="flex items-center gap-2 data-label text-slate-400 cursor-pointer">
                    <input type="checkbox" className="accent-cyan-400" checked={layers.aircraft.showLabels} onChange={e => updateLayer("aircraft", { showLabels: e.target.checked })} />
                    Show callsign labels
                  </label>
                )}
                {layers.satellites.visible && (
                  <label className="flex items-center gap-2 data-label text-slate-400 cursor-pointer">
                    <input type="checkbox" className="accent-amber-400" checked={layers.satellites.showOrbits} onChange={e => updateLayer("satellites", { showOrbits: e.target.checked })} />
                    Show orbit paths
                  </label>
                )}
                {layers.earthquakes.visible && (
                  <div className="flex items-center gap-2 data-label text-slate-400">
                    <span>Min M:</span>
                    <input type="range" min={0} max={8} step={0.5} value={minMag} onChange={e => setMinMagnitude(parseFloat(e.target.value))} className="flex-1 accent-red-500" />
                    <span className="w-6 text-red-300">{minMag}</span>
                  </div>
                )}
              </div>
            </OpPanel>

            {/* Ruler */}
            <OpPanel title="Distance Ruler" icon={Ruler} accentColor={AMBER}>
              <RulerPanel />
            </OpPanel>

            {/* Feed status */}
            <OpPanel title="Feed Status" icon={Activity} accentColor="#4ade80">
              <FeedStatusPanel />
            </OpPanel>
          </aside>
        )}

        {/* Left panel toggle */}
        <button
          className="absolute top-1/2 -translate-y-1/2 z-20 rounded-r py-3 px-1 transition-all"
          style={{
            left: panels.left ? "18rem" : "0",
            background: "oklch(0.18 0.009 240 / 0.9)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderLeft: "none",
            color: "rgba(148,163,184,0.7)",
          }}
          onClick={() => togglePanel("left")}
        >
          {panels.left ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {/* Globe */}
        <div className="flex-1 relative overflow-hidden">
          <Suspense fallback={
            <div className="flex h-full w-full items-center justify-center" style={{ background: "oklch(0.115 0.010 240)" }}>
              <div className="flex flex-col items-center gap-3">
                <Globe className="h-12 w-12 live-pulse" style={{ color: AMBER }} />
                <span className="data-label text-slate-500">INITIALIZING GLOBE...</span>
              </div>
            </div>
          }>
            <CesiumViewer />
          </Suspense>

          {/* Stats overlay */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10 pointer-events-none">
            {[
              { icon: Plane, count: aircraft.length, color: CYAN, label: "AC" },
              { icon: Satellite, count: satellites.length, color: "#fbbf24", label: "SAT" },
              { icon: AlertTriangle, count: earthquakes.length, color: "#ef4444", label: "EQ" },
              { icon: Camera, count: webcams.length, color: "#4ade80", label: "CAM" },
            ].map(({ icon: Icon, count, color, label }) => (
              <div key={label} className="flex items-center gap-1.5 rounded px-2.5 py-1.5" style={{ background: "oklch(0.14 0.009 240 / 0.85)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)" }}>
                <Icon className="h-3 w-3" style={{ color }} />
                <span className="data-value" style={{ color, fontSize: "0.78rem" }}>{count}</span>
                <span className="data-label text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel toggle */}
        <button
          className="absolute top-1/2 -translate-y-1/2 z-20 rounded-l py-3 px-1 transition-all"
          style={{
            right: panels.right ? "18rem" : "0",
            background: "oklch(0.18 0.009 240 / 0.9)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRight: "none",
            color: "rgba(148,163,184,0.7)",
          }}
          onClick={() => togglePanel("right")}
        >
          {panels.right ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        {/* Right Panel */}
        {panels.right && (
          <aside className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto op-scroll p-2 z-10" style={{ background: "oklch(0.13 0.009 240 / 0.85)", borderLeft: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(8px)" }}>
            <OpPanel title="Entity Detail" icon={Target} accentColor="#a78bfa">
              <EntityDetailPanel />
            </OpPanel>
          </aside>
        )}
      </div>

      {/* Bottom panel toggle */}
      <button
        className="absolute left-1/2 -translate-x-1/2 z-20 rounded-t px-6 py-1 transition-all"
        style={{
          bottom: panels.bottom ? "calc(22rem + 1px)" : "0",
          background: "oklch(0.18 0.009 240 / 0.9)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderBottom: "none",
          color: "rgba(148,163,184,0.7)",
        }}
        onClick={() => togglePanel("bottom")}
      >
        {panels.bottom ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>

      {/* Bottom Panel */}
      {panels.bottom && (
        <div className="shrink-0 z-10" style={{ height: "22rem", background: "oklch(0.13 0.009 240 / 0.95)", borderTop: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
          {/* Tabs */}
          <div className="flex items-center gap-0.5 px-3 pt-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  className="flex items-center gap-1.5 px-3 py-2 data-label uppercase tracking-wider border-b-2 transition-colors"
                  style={isActive
                    ? { borderColor: tab.color, color: tab.color }
                    : { borderColor: "transparent", color: "rgba(100,116,139,0.8)" }
                  }
                  onClick={() => setActiveTab(tab.key as any)}
                >
                  <Icon className="h-3 w-3" />
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="rounded px-1 py-0.5 data-label" style={{ background: "rgba(255,255,255,0.06)", color: isActive ? tab.color : "rgba(100,116,139,0.7)", fontSize: "0.6rem" }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="flex-1" />
            <span className="data-label text-slate-600 pr-2 uppercase tracking-widest">Telemetry Analytics</span>
          </div>

          <div className="flex h-[calc(100%-2.5rem)] overflow-hidden">
            {/* List */}
            <div className="w-80 shrink-0 overflow-y-auto op-scroll p-2" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
              {activeTab === "aircraft" && <AircraftList />}
              {activeTab === "satellites" && <SatelliteList />}
              {activeTab === "earthquakes" && <EarthquakeList />}
              {activeTab === "webcams" && <WebcamList />}
              {activeTab === "weather" && <WeatherPanel />}
            </div>

            {/* Analytics */}
            <div className="flex-1 p-2.5 overflow-hidden">
              <AnalyticsPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
