import { useEffect, lazy, Suspense } from "react";
import { useWorldViewSocket } from "@/hooks/useWorldViewSocket";
import useStore from "@/store/useStore";
import {
  Plane, Satellite, Globe, Camera, Activity, Wifi, WifiOff, RefreshCw,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Layers, Eye, EyeOff,
  AlertTriangle, Thermometer, Wind, Cloud, Zap, MapPin, X
} from "lucide-react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const CesiumViewer = lazy(() => import("@/components/globe/CesiumViewer"));

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

function StatusDot({ status }: { status: string }) {
  const color =
    status === "live" ? "bg-emerald-400"
    : status === "degraded" ? "bg-amber-400"
    : status === "fallback" ? "bg-sky-400"
    : status === "error" ? "bg-rose-400"
    : "bg-slate-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color} animate-pulse`} />;
}

function ConnectionBadge() {
  const status = useStore(s => s.status);
  const lastMessageAt = useStore(s => s.lastMessageAt);
  const isConnected = status === "connected";
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${isConnected ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
      {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      <span>{isConnected ? "Live" : status}</span>
      {lastMessageAt && <span className="text-[10px] opacity-60">{toRelativeTime(lastMessageAt)}</span>}
    </div>
  );
}

function Panel({ title, icon: Icon, accent, children }: { title: string; icon: any; accent: string; children: React.ReactNode }) {
  const accentClass = {
    cyan: "border-cyan-500/30 text-cyan-400",
    yellow: "border-yellow-500/30 text-yellow-400",
    emerald: "border-emerald-500/30 text-emerald-400",
    rose: "border-rose-500/30 text-rose-400",
    violet: "border-violet-500/30 text-violet-400",
    sky: "border-sky-500/30 text-sky-400",
  }[accent] ?? "border-white/10 text-slate-400";

  return (
    <div className={`flex flex-col rounded-2xl border ${accentClass.split(" ")[0]} bg-slate-900/80 backdrop-blur-sm overflow-hidden`}>
      <div className={`flex items-center gap-2 px-4 py-3 border-b ${accentClass.split(" ")[0]}`}>
        <Icon className={`h-4 w-4 ${accentClass.split(" ")[1]}`} />
        <span className={`text-xs font-semibold uppercase tracking-widest ${accentClass.split(" ")[1]}`}>{title}</span>
      </div>
      <div className="flex-1 overflow-hidden p-3">{children}</div>
    </div>
  );
}

function LayerToggle({ layerKey, label, icon: Icon, accent }: { layerKey: string; label: string; icon: any; accent: string }) {
  const layers = useStore(s => s.layers);
  const updateLayer = useStore(s => s.updateLayer);
  const layer = layers[layerKey as keyof typeof layers];
  const isVisible = layer?.visible ?? true;
  const accentOn = { cyan: "bg-cyan-500/20 border-cyan-500/40 text-cyan-300", yellow: "bg-yellow-500/20 border-yellow-500/40 text-yellow-300", emerald: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300", rose: "bg-rose-500/20 border-rose-500/40 text-rose-300", sky: "bg-sky-500/20 border-sky-500/40 text-sky-300" }[accent] ?? "";

  return (
    <button
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${isVisible ? accentOn : "border-white/10 bg-white/5 text-slate-500"}`}
      onClick={() => updateLayer(layerKey as any, { visible: !isVisible })}
    >
      {isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function FeedStatusPanel() {
  const feedStatus = useStore(s => s.feedStatus);
  const entries = Object.values(feedStatus);
  return (
    <div className="space-y-1.5">
      {entries.length === 0 ? (
        <div className="text-xs text-slate-500">Waiting for data feeds...</div>
      ) : entries.map(f => (
        <div key={f.source} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
          <StatusDot status={f.status} />
          <span className="flex-1 text-xs text-slate-300 capitalize">{f.source}</span>
          <span className="text-[10px] text-slate-500">{f.itemCount} items</span>
        </div>
      ))}
    </div>
  );
}

function AircraftList() {
  const aircraft = useStore(s => s.aircraft);
  const setSelectedEntity = useStore(s => s.setSelectedEntity);
  const search = useStore(s => s.filters.globalSearch);
  const filtered = aircraft
    .filter(a => !search || a.callsign?.toLowerCase().includes(search.toLowerCase()) || a.country?.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 50);

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
      {filtered.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-500">No aircraft data yet...</div>
      ) : filtered.map(a => (
        <button key={a.id} className="w-full flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-colors"
          onClick={() => setSelectedEntity({ type: "aircraft", id: a.id })}>
          <Plane className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate">{a.callsign || a.id}</div>
            <div className="text-[10px] text-slate-500">{a.country}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-slate-300">{formatNum(a.altitude ? a.altitude / 1000 : null, " km", 1)}</div>
            <div className="text-[10px] text-slate-500">{formatNum(a.velocity, " m/s", 0)}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function SatelliteList() {
  const satellites = useStore(s => s.satellites);
  const setSelectedEntity = useStore(s => s.setSelectedEntity);
  return (
    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
      {satellites.slice(0, 30).map(s => (
        <button key={s.id} className="w-full flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left hover:border-yellow-500/30 hover:bg-yellow-500/5 transition-colors"
          onClick={() => setSelectedEntity({ type: "satellites", id: s.id })}>
          <Satellite className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate">{s.name}</div>
            <div className="text-[10px] text-slate-500">{s.category}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-slate-300">{formatNum(s.altitude ? s.altitude / 1000 : null, " km", 0)}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function EarthquakeList() {
  const earthquakes = useStore(s => s.earthquakes);
  const minMag = useStore(s => s.filters.earthquakes.minMagnitude);
  const setSelectedEntity = useStore(s => s.setSelectedEntity);
  const filtered = earthquakes.filter(e => e.magnitude >= minMag).slice(0, 30);
  return (
    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
      {filtered.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-500">No earthquakes above M{minMag}...</div>
      ) : filtered.map(q => (
        <button key={q.id} className="w-full flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left hover:border-rose-500/30 hover:bg-rose-500/5 transition-colors"
          onClick={() => setSelectedEntity({ type: "earthquakes", id: q.id })}>
          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${q.magnitude >= 6 ? "bg-rose-500/30 text-rose-300" : q.magnitude >= 4 ? "bg-orange-500/30 text-orange-300" : "bg-yellow-500/30 text-yellow-300"}`}>
            {q.magnitude.toFixed(1)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate">{q.place}</div>
            <div className="text-[10px] text-slate-500">{toRelativeTime(q.time)}</div>
          </div>
          {q.tsunami && <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
        </button>
      ))}
    </div>
  );
}

function WebcamList() {
  const webcams = useStore(s => s.webcams);
  const setSelectedEntity = useStore(s => s.setSelectedEntity);
  return (
    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
      {webcams.map(w => (
        <button key={w.id} className="w-full flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-colors"
          onClick={() => setSelectedEntity({ type: "webcams", id: w.id })}>
          <Camera className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate">{w.name}</div>
            <div className="text-[10px] text-slate-500">{w.region}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function WeatherPanel() {
  const weatherSummary = useStore(s => s.weatherSummary);
  const alerts = useStore(s => s.alerts);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {weatherSummary.slice(0, 6).map(w => (
          <div key={w.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-200">{w.name}</span>
              <span className="text-[10px] text-slate-500">{w.region}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Thermometer className="h-3 w-3 text-orange-400" />
              <span className="text-sm font-bold text-slate-100">{formatNum(w.temperature, "°C", 1)}</span>
              <span className="text-[10px] text-slate-400">{w.condition}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
              <Wind className="h-2.5 w-2.5" />
              {formatNum(w.windSpeed, " km/h", 0)}
              <Cloud className="h-2.5 w-2.5 ml-1" />
              {formatNum(w.cloudCover, "%", 0)}
            </div>
          </div>
        ))}
      </div>
      {alerts.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] uppercase tracking-widest text-amber-400">Active Alerts ({alerts.length})</div>
          {alerts.slice(0, 3).map(a => (
            <div key={a.id} className="mb-1.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <Zap className="h-3 w-3 text-amber-400" />
                <span className="text-xs text-slate-200">{a.event}</span>
                <span className="ml-auto text-[10px] text-amber-300">{a.severity}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">{a.area}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EntityDetailPanel() {
  const selectedEntity = useStore(s => s.selectedEntity);
  const clearSelection = useStore(s => s.clearSelection);
  const aircraft = useStore(s => s.aircraft);
  const satellites = useStore(s => s.satellites);
  const webcams = useStore(s => s.webcams);
  const earthquakes = useStore(s => s.earthquakes);

  if (!selectedEntity) return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 py-8">
      <Globe className="h-8 w-8 opacity-30" />
      <span className="text-xs">Click any entity on the globe</span>
    </div>
  );

  const dataMap: Record<string, any[]> = { aircraft, satellites, webcams, earthquakes };
  const item = dataMap[selectedEntity.type]?.find((i: any) => i.id === selectedEntity.id);
  if (!item) return null;

  const renderDetail = () => {
    if (selectedEntity.type === "aircraft") {
      const a = item;
      return (
        <div className="space-y-2">
          <div className="text-lg font-bold text-cyan-300">{a.callsign || a.id}</div>
          <div className="text-xs text-slate-400">{a.country}</div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[
              ["Altitude", formatNum(a.altitude ? a.altitude / 1000 : null, " km", 1)],
              ["Speed", formatNum(a.velocity, " m/s", 0)],
              ["Heading", formatNum(a.heading, "°", 0)],
              ["Vertical", formatNum(a.verticalRate, " m/s", 1)],
              ["Lat", formatNum(a.latitude, "°", 3)],
              ["Lon", formatNum(a.longitude, "°", 3)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white/[0.04] p-2">
                <div className="text-[10px] text-slate-500">{k}</div>
                <div className="text-xs font-medium text-slate-200">{v}</div>
              </div>
            ))}
          </div>
          {a.onGround && <div className="text-xs text-amber-400 mt-1">On ground</div>}
        </div>
      );
    }
    if (selectedEntity.type === "satellites") {
      const s = item;
      return (
        <div className="space-y-2">
          <div className="text-lg font-bold text-yellow-300">{s.name}</div>
          <div className="text-xs text-slate-400">{s.category}</div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[
              ["Altitude", formatNum(s.altitude ? s.altitude / 1000 : null, " km", 0)],
              ["Lat", formatNum(s.latitude, "°", 2)],
              ["Lon", formatNum(s.longitude, "°", 2)],
              ["Source", s.source],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white/[0.04] p-2">
                <div className="text-[10px] text-slate-500">{k}</div>
                <div className="text-xs font-medium text-slate-200">{v}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (selectedEntity.type === "earthquakes") {
      const q = item;
      return (
        <div className="space-y-2">
          <div className={`text-2xl font-bold ${q.magnitude >= 6 ? "text-rose-300" : q.magnitude >= 4 ? "text-orange-300" : "text-yellow-300"}`}>M{q.magnitude.toFixed(1)}</div>
          <div className="text-sm text-slate-200">{q.place}</div>
          <div className="text-xs text-slate-400">{toRelativeTime(q.time)}</div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[
              ["Depth", formatNum(q.depthKm, " km", 1)],
              ["Significance", String(q.significance)],
              ["Felt", String(q.felt || 0)],
              ["Status", q.status],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white/[0.04] p-2">
                <div className="text-[10px] text-slate-500">{k}</div>
                <div className="text-xs font-medium text-slate-200">{v}</div>
              </div>
            ))}
          </div>
          {q.tsunami && <div className="flex items-center gap-1.5 text-xs text-amber-400"><AlertTriangle className="h-3.5 w-3.5" /> Tsunami warning</div>}
          {q.url && <a href={q.url} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">View on USGS →</a>}
        </div>
      );
    }
    if (selectedEntity.type === "webcams") {
      const w = item;
      return (
        <div className="space-y-2">
          <div className="text-base font-bold text-emerald-300">{w.name}</div>
          <div className="text-xs text-slate-400">{w.region} · {w.park}</div>
          <img
            src={w.proxySnapshotUrl}
            alt={w.name}
            className="w-full rounded-xl border border-white/10 mt-2 object-cover"
            style={{ maxHeight: 180 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="text-[10px] text-slate-500">{w.description}</div>
          <a href={w.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">Open live feed →</a>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative">
      <button className="absolute right-0 top-0 text-slate-500 hover:text-slate-300" onClick={clearSelection}>
        <X className="h-4 w-4" />
      </button>
      {renderDetail()}
    </div>
  );
}

function AnalyticsPanel() {
  const aircraft = useStore(s => s.aircraft);
  const earthquakes = useStore(s => s.earthquakes);

  const topAircraft = [...aircraft]
    .filter(a => a.velocity && a.velocity > 0)
    .sort((a, b) => (b.velocity ?? 0) - (a.velocity ?? 0))
    .slice(0, 6)
    .map(a => ({ name: a.callsign?.slice(0, 6) || a.id.slice(0, 6), speed: Math.round(a.velocity ?? 0) }));

  const recentQuakes = [...earthquakes]
    .sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""))
    .slice(0, 8)
    .map((q, i) => ({ name: `#${i + 1}`, magnitude: q.magnitude }));

  return (
    <div className="grid grid-cols-2 gap-3 h-full">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-400">
          <Plane className="h-3 w-3" /> Fastest Aircraft
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={topAircraft} margin={{ left: -20, right: 4, top: 4, bottom: 16 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 9 }} angle={-15} height={36} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} width={28} />
            <Tooltip contentStyle={{ background: "#020617", border: "1px solid rgba(148,163,184,0.15)", borderRadius: "10px", fontSize: 11 }} />
            <Bar dataKey="speed" fill="#22d3ee" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-400">
          <AlertTriangle className="h-3 w-3" /> Recent Quakes
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={recentQuakes} margin={{ left: -20, right: 4, top: 4, bottom: 16 }}>
            <defs>
              <linearGradient id="qFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fb7185" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#fb7185" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 9 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} width={28} domain={[0, 9]} />
            <Tooltip contentStyle={{ background: "#020617", border: "1px solid rgba(148,163,184,0.15)", borderRadius: "10px", fontSize: 11 }} />
            <Area dataKey="magnitude" fill="url(#qFill)" stroke="#fb7185" strokeWidth={2} type="monotone" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

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

  // Set page title
  useEffect(() => {
    document.title = "WorldView — Real-Time Earth Dashboard";
  }, []);

  const tabs = [
    { key: "aircraft", label: "Aircraft", icon: Plane, count: aircraft.length, accent: "cyan" },
    { key: "satellites", label: "Satellites", icon: Satellite, count: satellites.length, accent: "yellow" },
    { key: "earthquakes", label: "Quakes", icon: AlertTriangle, count: earthquakes.length, accent: "rose" },
    { key: "webcams", label: "Webcams", icon: Camera, count: webcams.length, accent: "emerald" },
    { key: "weather", label: "Weather", icon: Cloud, count: 0, accent: "sky" },
  ] as const;

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-white/10 bg-slate-950/90 px-4 py-2.5 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-cyan-400" />
          <span className="text-sm font-bold tracking-tight text-white">WorldView</span>
          <span className="hidden sm:block text-[10px] text-slate-500 uppercase tracking-widest">Real-Time Earth Dashboard</span>
        </div>
        <div className="flex-1" />
        {/* Imagery */}
        <select
          className="rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300 px-2 py-1 focus:outline-none"
          value={imageryPreset}
          onChange={e => setImageryPreset(e.target.value as any)}
        >
          <option value="osm">Street Map</option>
          <option value="dark">Natural Earth</option>
          <option value="ion">Dark Globe</option>
        </select>
        {/* Visual mode */}
        <select
          className="rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300 px-2 py-1 focus:outline-none"
          value={visualMode}
          onChange={e => setVisualMode(e.target.value as any)}
        >
          <option value="normal">Normal</option>
          <option value="green">Night Vision</option>
          <option value="mono">Monochrome</option>
        </select>
        <ConnectionBadge />
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        {panels.left && (
          <aside className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto border-r border-white/10 bg-slate-950/80 p-2 z-10">
            {/* Search */}
            <div className="relative">
              <input
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/40"
                placeholder="Search aircraft, country..."
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
              />
            </div>

            {/* Layer toggles */}
            <Panel title="Layers" icon={Layers} accent="cyan">
              <div className="flex flex-wrap gap-1.5">
                <LayerToggle layerKey="aircraft" label="Aircraft" icon={Plane} accent="cyan" />
                <LayerToggle layerKey="satellites" label="Satellites" icon={Satellite} accent="yellow" />
                <LayerToggle layerKey="earthquakes" label="Quakes" icon={AlertTriangle} accent="rose" />
                <LayerToggle layerKey="webcams" label="Webcams" icon={Camera} accent="emerald" />
                <LayerToggle layerKey="weather" label="Weather" icon={Cloud} accent="sky" />
              </div>
              {/* Sub-options */}
              <div className="mt-2 space-y-1.5">
                {layers.aircraft.visible && (
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input type="checkbox" className="accent-cyan-500" checked={layers.aircraft.showTrails} onChange={e => updateLayer("aircraft", { showTrails: e.target.checked })} />
                    Show flight trails
                  </label>
                )}
                {layers.satellites.visible && (
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input type="checkbox" className="accent-yellow-500" checked={layers.satellites.showOrbits} onChange={e => updateLayer("satellites", { showOrbits: e.target.checked })} />
                    Show orbit paths
                  </label>
                )}
                {layers.earthquakes.visible && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Min M:</span>
                    <input type="range" min={0} max={8} step={0.5} value={minMag} onChange={e => setMinMagnitude(parseFloat(e.target.value))} className="flex-1 accent-rose-500" />
                    <span className="w-6 text-rose-300">{minMag}</span>
                  </div>
                )}
              </div>
            </Panel>

            {/* Feed status */}
            <Panel title="Feed Status" icon={Activity} accent="emerald">
              <FeedStatusPanel />
            </Panel>
          </aside>
        )}

        {/* Left panel toggle */}
        <button
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 rounded-r-lg bg-slate-800/80 border border-white/10 p-1 text-slate-400 hover:text-white transition-colors"
          style={{ left: panels.left ? "18rem" : "0" }}
          onClick={() => togglePanel("left")}
        >
          {panels.left ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Globe */}
        <div className="flex-1 relative overflow-hidden">
          <Suspense fallback={
            <div className="flex h-full w-full items-center justify-center bg-slate-950">
              <div className="flex flex-col items-center gap-3">
                <Globe className="h-12 w-12 text-cyan-400 animate-spin" />
                <span className="text-sm text-slate-400">Loading 3D Globe...</span>
              </div>
            </div>
          }>
            <CesiumViewer />
          </Suspense>

          {/* Stats overlay */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 z-10 pointer-events-none">
            {[
              { icon: Plane, count: aircraft.length, color: "text-cyan-400", label: "Aircraft" },
              { icon: Satellite, count: satellites.length, color: "text-yellow-400", label: "Satellites" },
              { icon: AlertTriangle, count: earthquakes.length, color: "text-rose-400", label: "Quakes" },
              { icon: Camera, count: webcams.length, color: "text-emerald-400", label: "Webcams" },
            ].map(({ icon: Icon, count, color, label }) => (
              <div key={label} className="flex items-center gap-1.5 rounded-full bg-slate-900/80 border border-white/10 px-3 py-1.5 backdrop-blur-sm">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className="text-xs font-medium text-slate-200">{count}</span>
                <span className="text-[10px] text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel toggle */}
        <button
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 rounded-l-lg bg-slate-800/80 border border-white/10 p-1 text-slate-400 hover:text-white transition-colors"
          style={{ right: panels.right ? "18rem" : "0" }}
          onClick={() => togglePanel("right")}
        >
          {panels.right ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {/* Right Panel */}
        {panels.right && (
          <aside className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto border-l border-white/10 bg-slate-950/80 p-2 z-10">
            <Panel title="Entity Detail" icon={MapPin} accent="violet">
              <EntityDetailPanel />
            </Panel>
          </aside>
        )}
      </div>

      {/* Bottom Panel toggle */}
      <button
        className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20 rounded-t-lg bg-slate-800/80 border border-white/10 px-4 py-1 text-slate-400 hover:text-white transition-colors"
        style={{ bottom: panels.bottom ? "calc(22rem + 2px)" : "0" }}
        onClick={() => togglePanel("bottom")}
      >
        {panels.bottom ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {/* Bottom Panel */}
      {panels.bottom && (
        <div className="shrink-0 border-t border-white/10 bg-slate-950/90 backdrop-blur-sm z-10" style={{ height: "22rem" }}>
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-white/10 px-3 pt-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              const accentClass = {
                cyan: "border-cyan-400 text-cyan-300",
                yellow: "border-yellow-400 text-yellow-300",
                rose: "border-rose-400 text-rose-300",
                emerald: "border-emerald-400 text-emerald-300",
                sky: "border-sky-400 text-sky-300",
              }[tab.accent];
              return (
                <button
                  key={tab.key}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${isActive ? `${accentClass}` : "border-transparent text-slate-500 hover:text-slate-300"}`}
                  onClick={() => setActiveTab(tab.key as any)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {tab.count > 0 && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{tab.count}</span>}
                </button>
              );
            })}
            <div className="flex-1" />
            <span className="text-[10px] text-slate-600 pr-2">Telemetry Analytics</span>
          </div>

          <div className="flex h-full overflow-hidden">
            {/* List */}
            <div className="w-80 shrink-0 overflow-y-auto border-r border-white/10 p-2">
              {activeTab === "aircraft" && <AircraftList />}
              {activeTab === "satellites" && <SatelliteList />}
              {activeTab === "earthquakes" && <EarthquakeList />}
              {activeTab === "webcams" && <WebcamList />}
              {activeTab === "weather" && <WeatherPanel />}
            </div>

            {/* Analytics */}
            <div className="flex-1 p-3 overflow-hidden">
              <AnalyticsPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
