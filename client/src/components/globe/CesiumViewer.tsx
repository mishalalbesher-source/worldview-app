import { useEffect, useRef, useState } from "react";
import useStore from "@/store/useStore";
import type { Aircraft, Satellite, Earthquake, Webcam } from "@/store/useStore";

// Cesium is loaded via CDN script tag in index.html
declare const Cesium: any;

// ─── Canvas Icon Factory ──────────────────────────────────────────────────────
function makeCanvasIcon(drawFn: (ctx: CanvasRenderingContext2D, size: number) => void, size = 28): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  drawFn(ctx, size);
  return canvas;
}

// Civilian aircraft — rounded, neutral cyan-white
function getCivilianPlaneIcon(heading = 0, size = 28): HTMLCanvasElement {
  return makeCanvasIcon((ctx, s) => {
    ctx.save();
    ctx.translate(s / 2, s / 2);
    ctx.rotate(((heading - 90) * Math.PI) / 180);
    ctx.translate(-s / 2, -s / 2);
    // Body
    ctx.fillStyle = "#67e8f9"; // cyan-300
    ctx.beginPath();
    ctx.moveTo(s / 2, 2);
    ctx.bezierCurveTo(s / 2 + 3, s * 0.35, s / 2 + 4, s * 0.55, s / 2 + 2, s * 0.65);
    ctx.lineTo(s - 3, s * 0.75);
    ctx.lineTo(s / 2 + 2, s * 0.65);
    ctx.lineTo(s / 2 + 2, s - 4);
    ctx.lineTo(s / 2, s - 3);
    ctx.lineTo(s / 2 - 2, s - 4);
    ctx.lineTo(s / 2 - 2, s * 0.65);
    ctx.lineTo(3, s * 0.75);
    ctx.lineTo(s / 2 - 2, s * 0.65);
    ctx.bezierCurveTo(s / 2 - 4, s * 0.55, s / 2 - 3, s * 0.35, s / 2, 2);
    ctx.closePath();
    ctx.fill();
    // Center dot
    ctx.fillStyle = "#0e7490"; // cyan-700
    ctx.beginPath();
    ctx.arc(s / 2, s * 0.5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, size);
}

// Military aircraft — angular, tactical amber-red
function getMilitaryPlaneIcon(heading = 0, subtype = "other", size = 28): HTMLCanvasElement {
  const color = subtype === "fighter" ? "#f97316"    // orange-500
    : subtype === "isr" ? "#a78bfa"                  // violet-400
    : subtype === "transport" ? "#fbbf24"            // amber-400
    : subtype === "uav" ? "#f43f5e"                  // rose-500
    : subtype === "helicopter" ? "#fb923c"           // orange-400
    : "#ef4444";                                     // red-500

  return makeCanvasIcon((ctx, s) => {
    ctx.save();
    ctx.translate(s / 2, s / 2);
    ctx.rotate(((heading - 90) * Math.PI) / 180);
    ctx.translate(-s / 2, -s / 2);
    // Angular tactical silhouette (delta wing shape)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s / 2, 1);          // nose
    ctx.lineTo(s - 2, s * 0.72);  // right wing tip
    ctx.lineTo(s * 0.62, s * 0.58); // right wing root
    ctx.lineTo(s * 0.58, s - 3);   // right tail
    ctx.lineTo(s / 2, s * 0.82);   // tail center
    ctx.lineTo(s * 0.42, s - 3);   // left tail
    ctx.lineTo(s * 0.38, s * 0.58); // left wing root
    ctx.lineTo(2, s * 0.72);       // left wing tip
    ctx.closePath();
    ctx.fill();
    // Cockpit highlight
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.ellipse(s / 2, s * 0.32, 2.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, size);
}

function getSatelliteIcon(size = 26): HTMLCanvasElement {
  return makeCanvasIcon((ctx, s) => {
    // Solar panels
    ctx.fillStyle = "#fbbf24"; // amber-400
    ctx.fillRect(s * 0.05, s * 0.4, s * 0.28, s * 0.2);
    ctx.fillRect(s * 0.67, s * 0.4, s * 0.28, s * 0.2);
    // Panel dividers
    ctx.strokeStyle = "#92400e";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(s * 0.05, s * 0.4, s * 0.28, s * 0.2);
    ctx.strokeRect(s * 0.67, s * 0.4, s * 0.28, s * 0.2);
    // Body
    ctx.fillStyle = "#d97706"; // amber-600
    ctx.fillRect(s * 0.35, s * 0.3, s * 0.3, s * 0.4);
    // Antenna
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.3);
    ctx.lineTo(s / 2, s * 0.12);
    ctx.stroke();
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(s / 2, s * 0.1, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }, size);
}

function getEarthquakeIcon(magnitude: number, size = 24): HTMLCanvasElement {
  const color = magnitude >= 6 ? "#ef4444" : magnitude >= 4 ? "#f97316" : "#eab308";
  const innerColor = magnitude >= 6 ? "#fca5a5" : magnitude >= 4 ? "#fdba74" : "#fde047";
  return makeCanvasIcon((ctx, s) => {
    // Outer ring (pulsing effect baked in)
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Inner circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.28, 0, Math.PI * 2);
    ctx.fill();
    // Core
    ctx.fillStyle = innerColor;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }, size);
}

function getWebcamIcon(size = 22): HTMLCanvasElement {
  return makeCanvasIcon((ctx, s) => {
    // Camera body
    ctx.fillStyle = "#4ade80"; // green-400
    ctx.beginPath();
    ctx.roundRect(s * 0.08, s * 0.28, s * 0.72, s * 0.5, 3);
    ctx.fill();
    // Lens
    ctx.fillStyle = "#052e16"; // green-950
    ctx.beginPath();
    ctx.arc(s * 0.44, s * 0.53, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4ade80";
    ctx.beginPath();
    ctx.arc(s * 0.44, s * 0.53, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // Flash
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(s * 0.7, s * 0.35, s * 0.18, s * 0.1);
    // Viewfinder bump
    ctx.fillRect(s * 0.35, s * 0.2, s * 0.18, s * 0.1);
    // Recording dot
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(s * 0.72, s * 0.55, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }, size);
}

// ─── Label helper ─────────────────────────────────────────────────────────────
function makeLabel(text: string, color?: any) {
  return {
    text: text || "",
    font: "500 10px 'JetBrains Mono', monospace",
    fillColor: color || Cesium.Color.fromCssColorString("#67e8f9"),
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 3,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cesium.Cartesian2(0, -20),
    scaleByDistance: new Cesium.NearFarScalar(1e4, 1.0, 5e6, 0.0),
    show: true,
  };
}

function altitudeForSelection(type: string, altitude?: number | null): number {
  if (type === "satellites") return (altitude ?? 400_000) + 200_000;
  if (type === "aircraft") return (altitude ?? 10_000) + 50_000;
  return 500_000;
}

// ─── Sync helper ──────────────────────────────────────────────────────────────
interface SyncOptions<T> {
  source: any;
  mapRef: React.MutableRefObject<Map<string, any>>;
  items: T[];
  idPrefix: string;
  buildEntity: (entity: any, item: T) => void;
}

function syncCollection<T extends { id: string }>({ source, mapRef, items, idPrefix, buildEntity }: SyncOptions<T>) {
  if (!source || !source.entities) return;
  const activeIds = new Set<string>();
  for (const item of items) {
    const entityId = `${idPrefix}-${item.id}`;
    activeIds.add(entityId);
    let entity = mapRef.current.get(entityId);
    if (!entity) {
      entity = source.entities.add({ id: entityId });
      mapRef.current.set(entityId, entity);
    }
    buildEntity(entity, item);
  }
  for (const [id, entity] of Array.from(mapRef.current.entries())) {
    if (!activeIds.has(id)) {
      source.entities.remove(entity);
      mapRef.current.delete(id);
    }
  }
}

// ─── Ruler polyline helpers ───────────────────────────────────────────────────
function toCartesian(lon: number, lat: number): any {
  return Cesium.Cartesian3.fromDegrees(lon, lat, 1000);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const aircraftSourceRef = useRef<any>(null);
  const satelliteSourceRef = useRef<any>(null);
  const webcamSourceRef = useRef<any>(null);
  const earthquakeSourceRef = useRef<any>(null);
  const weatherLayerRef = useRef<any>(null);
  const rulerSourceRef = useRef<any>(null);
  const aircraftEntitiesRef = useRef<Map<string, any>>(new Map());
  const satelliteEntitiesRef = useRef<Map<string, any>>(new Map());
  const webcamEntitiesRef = useRef<Map<string, any>>(new Map());
  const earthquakeEntitiesRef = useRef<Map<string, any>>(new Map());

  const aircraft = useStore(s => s.aircraft);
  const satellites = useStore(s => s.satellites);
  const webcams = useStore(s => s.webcams);
  const earthquakes = useStore(s => s.earthquakes);
  const layers = useStore(s => s.layers);
  const weatherConfig = useStore(s => s.weatherConfig);
  const selectedEntity = useStore(s => s.selectedEntity);
  const visualMode = useStore(s => s.visualMode);
  const imageryPreset = useStore(s => s.imageryPreset);
  const ruler = useStore(s => s.ruler);
  const setSelectedEntity = useStore(s => s.setSelectedEntity);
  const addRulerPoint = useStore(s => s.addRulerPoint);
  const setSelectedEntityRef = useRef(setSelectedEntity);
  const addRulerPointRef = useRef(addRulerPoint);
  const rulerRef = useRef(ruler);
  setSelectedEntityRef.current = setSelectedEntity;
  addRulerPointRef.current = addRulerPoint;
  rulerRef.current = ruler;

  // ── Initialize Cesium viewer ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
    if (typeof Cesium === "undefined") return;

    Cesium.Ion.defaultAccessToken = "";

    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      imageryProvider: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      requestRenderMode: false,
    });

    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.atmosphere.show = true;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.fog.enabled = true;

    viewer.scene.renderError.addEventListener((_scene: any, error: any) => {
      console.warn("[CesiumViewer] Render error:", error?.message || error);
    });

    // Data sources
    const aircraftSource = new Cesium.CustomDataSource("aircraft");
    const satelliteSource = new Cesium.CustomDataSource("satellites");
    const webcamSource = new Cesium.CustomDataSource("webcams");
    const earthquakeSource = new Cesium.CustomDataSource("earthquakes");
    const rulerSource = new Cesium.CustomDataSource("ruler");
    viewer.dataSources.add(aircraftSource);
    viewer.dataSources.add(satelliteSource);
    viewer.dataSources.add(webcamSource);
    viewer.dataSources.add(earthquakeSource);
    viewer.dataSources.add(rulerSource);

    aircraftSourceRef.current = aircraftSource;
    satelliteSourceRef.current = satelliteSource;
    webcamSourceRef.current = webcamSource;
    earthquakeSourceRef.current = earthquakeSource;
    rulerSourceRef.current = rulerSource;
    viewerRef.current = viewer;
    setViewerReady(true);

    // Initial imagery
    try {
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          credit: "© OpenStreetMap contributors",
          maximumLevel: 19,
        })
      );
    } catch (e) {
      console.warn("[CesiumViewer] Initial imagery error:", e);
    }

    // Click handler — ruler or entity selection
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      const currentRuler = rulerRef.current;
      if (currentRuler.active) {
        // Add ruler point at clicked position
        const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
        if (cartesian) {
          const carto = Cesium.Cartographic.fromCartesian(cartesian);
          addRulerPointRef.current({
            longitude: Cesium.Math.toDegrees(carto.longitude),
            latitude: Cesium.Math.toDegrees(carto.latitude),
          });
        }
        return;
      }
      // Normal entity pick
      const picked = viewer.scene.pick(click.position);
      if (Cesium.defined(picked) && picked.id) {
        const entity = picked.id;
        const props = entity.properties;
        if (props) {
          const entityType = props.entityType?.getValue();
          const itemId = props.itemId?.getValue();
          if (entityType && itemId) {
            setSelectedEntityRef.current({ type: entityType, id: itemId });
            return;
          }
        }
      }
      setSelectedEntityRef.current(null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Imagery preset ──────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      viewer.imageryLayers.removeAll();
      if (imageryPreset === "osm") {
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            credit: "© OpenStreetMap contributors",
            maximumLevel: 19,
          })
        );
      } else if (imageryPreset === "dark") {
        // Dark CartoDB Positron-style tiles
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            credit: "© CARTO © OpenStreetMap contributors",
            maximumLevel: 19,
          })
        );
      } else {
        // Natural Earth II (ion preset = default)
        viewer.imageryLayers.addImageryProvider(
          new Cesium.TileMapServiceImageryProvider({ url: Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII") })
        );
      }
    } catch (e) {
      console.warn("[CesiumViewer] Imagery error:", e);
    }
    viewer.scene.requestRender();
  }, [imageryPreset]);

  // ── Visual mode (post-processing) ──────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const pp = viewer.scene.postProcessStages;
    // Remove existing custom stages
    try {
      if (viewer._customPostProcess) {
        pp.remove(viewer._customPostProcess);
        viewer._customPostProcess = null;
      }
      if (visualMode === "green") {
        // Night-vision green tint
        const stage = pp.add(new Cesium.PostProcessStage({
          fragmentShader: `
            uniform sampler2D colorTexture;
            in vec2 v_textureCoordinates;
            void main() {
              vec4 color = texture(colorTexture, v_textureCoordinates);
              float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
              out_FragColor = vec4(0.0, lum * 1.4, 0.0, color.a);
            }
          `,
        }));
        viewer._customPostProcess = stage;
      } else if (visualMode === "mono") {
        const stage = pp.add(new Cesium.PostProcessStage({
          fragmentShader: `
            uniform sampler2D colorTexture;
            in vec2 v_textureCoordinates;
            void main() {
              vec4 color = texture(colorTexture, v_textureCoordinates);
              float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
              out_FragColor = vec4(lum, lum, lum, color.a);
            }
          `,
        }));
        viewer._customPostProcess = stage;
      }
    } catch {
      // Post-processing not available in all environments
    }
    viewer.scene.requestRender();
  }, [visualMode]);

  // ── Weather overlay ─────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (weatherLayerRef.current) {
      viewer.imageryLayers.remove(weatherLayerRef.current);
      weatherLayerRef.current = null;
    }
    if (layers.weather.visible && weatherConfig?.tileTemplate) {
      try {
        const provider = new Cesium.UrlTemplateImageryProvider({
          url: weatherConfig.tileTemplate,
          maximumLevel: weatherConfig.maximumLevel ?? 7,
          credit: weatherConfig.source ?? "Weather",
        });
        const layer = viewer.imageryLayers.addImageryProvider(provider);
        layer.alpha = layers.weather.opacity ?? 0.55;
        weatherLayerRef.current = layer;
      } catch { /* ignore */ }
    }
    viewer.scene.requestRender();
  }, [weatherConfig, layers.weather.visible, layers.weather.opacity]);

  // ── Aircraft ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!aircraftSourceRef.current || !viewerRef.current) return;
    const visibleAircraft = layers.aircraft.visible
      ? aircraft.filter(p => p.latitude !== null && p.longitude !== null).slice(0, layers.aircraft.maxVisible ?? 1500)
      : [];

    syncCollection<Aircraft>({
      source: aircraftSourceRef.current,
      mapRef: aircraftEntitiesRef,
      items: visibleAircraft,
      idPrefix: "ac",
      buildEntity: (entity, a) => {
        const isMilitary = a.aircraftClass === "military";
        const heading = a.heading ?? 0;
        const icon = isMilitary
          ? getMilitaryPlaneIcon(heading, a.militarySubtype ?? "other")
          : getCivilianPlaneIcon(heading);

        entity.position = Cesium.Cartesian3.fromDegrees(a.longitude!, a.latitude!, a.altitude ?? 0);
        entity.billboard = {
          image: icon,
          width: isMilitary ? 28 : 24,
          height: isMilitary ? 28 : 24,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          scaleByDistance: new Cesium.NearFarScalar(1e4, 1.2, 8e6, 0.4),
          pixelOffset: new Cesium.Cartesian2(0, 0),
        };
        if (layers.aircraft.showLabels) {
          const labelColor = isMilitary
            ? Cesium.Color.fromCssColorString("#f97316")
            : Cesium.Color.fromCssColorString("#67e8f9");
          entity.label = makeLabel(a.callsign || a.id, labelColor);
        } else {
          entity.label = undefined;
        }
        entity.properties = new Cesium.PropertyBag({
          entityType: "aircraft",
          itemId: a.id,
          aircraftClass: a.aircraftClass ?? "civilian",
        });

        // Flight trail
        if (layers.aircraft.showTrails && a.trail && a.trail.length > 1) {
          const positions = a.trail.map(([lon, lat, alt]) =>
            Cesium.Cartesian3.fromDegrees(lon, lat, alt ?? 0)
          );
          entity.polyline = {
            positions,
            width: 1.5,
            material: isMilitary
              ? new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.15, color: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.6) })
              : new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.1, color: Cesium.Color.fromCssColorString("#67e8f9").withAlpha(0.4) }),
          };
        } else {
          entity.polyline = undefined;
        }
      },
    });
    viewerRef.current.scene.requestRender();
  }, [aircraft, layers.aircraft]);

  // ── Satellites ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!satelliteSourceRef.current || !viewerRef.current) return;
    const visibleSats = layers.satellites.visible
      ? satellites.filter(s => s.latitude !== null && s.longitude !== null).slice(0, layers.satellites.maxVisible ?? 120)
      : [];

    syncCollection<Satellite>({
      source: satelliteSourceRef.current,
      mapRef: satelliteEntitiesRef,
      items: visibleSats,
      idPrefix: "sat",
      buildEntity: (entity, s) => {
        entity.position = Cesium.Cartesian3.fromDegrees(s.longitude, s.latitude, s.altitude ?? 400_000);
        entity.billboard = {
          image: getSatelliteIcon(),
          width: 22,
          height: 22,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          scaleByDistance: new Cesium.NearFarScalar(1e5, 1.2, 2e7, 0.3),
        };
        if (layers.satellites.showLabels) {
          entity.label = makeLabel(s.name, Cesium.Color.fromCssColorString("#fbbf24"));
        } else {
          entity.label = undefined;
        }
        entity.properties = new Cesium.PropertyBag({ entityType: "satellites", itemId: s.id });
        // Orbit path
        if (layers.satellites.showOrbits && s.orbit && s.orbit.length > 1) {
          const positions = s.orbit.map(([lon, lat, alt]) =>
            Cesium.Cartesian3.fromDegrees(lon, lat, alt ?? 400_000)
          );
          entity.polyline = {
            positions,
            width: 1,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.1,
              color: Cesium.Color.fromCssColorString("#fbbf24").withAlpha(0.3),
            }),
          };
        } else {
          entity.polyline = undefined;
        }
      },
    });
    viewerRef.current.scene.requestRender();
  }, [satellites, layers.satellites]);

  // ── Webcams ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!webcamSourceRef.current || !viewerRef.current) return;
    const visibleWebcams = layers.webcams.visible ? webcams.slice(0, layers.webcams.maxVisible ?? 60) : [];
    syncCollection<Webcam>({
      source: webcamSourceRef.current,
      mapRef: webcamEntitiesRef,
      items: visibleWebcams,
      idPrefix: "cam",
      buildEntity: (entity, w) => {
        entity.position = Cesium.Cartesian3.fromDegrees(w.longitude, w.latitude, 50);
        entity.billboard = {
          image: getWebcamIcon(),
          width: 20,
          height: 20,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          scaleByDistance: new Cesium.NearFarScalar(1e4, 1.2, 5e6, 0.4),
        };
        entity.properties = new Cesium.PropertyBag({ entityType: "webcams", itemId: w.id });
      },
    });
    viewerRef.current.scene.requestRender();
  }, [webcams, layers.webcams]);

  // ── Earthquakes ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!earthquakeSourceRef.current || !viewerRef.current) return;
    const visibleQuakes = layers.earthquakes.visible
      ? earthquakes.slice(0, layers.earthquakes.maxVisible ?? 150)
      : [];
    syncCollection<Earthquake>({
      source: earthquakeSourceRef.current,
      mapRef: earthquakeEntitiesRef,
      items: visibleQuakes,
      idPrefix: "eq",
      buildEntity: (entity, q) => {
        entity.position = Cesium.Cartesian3.fromDegrees(q.longitude, q.latitude, 0);
        entity.billboard = {
          image: getEarthquakeIcon(q.magnitude),
          width: Math.min(20 + q.magnitude * 3, 36),
          height: Math.min(20 + q.magnitude * 3, 36),
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          scaleByDistance: new Cesium.NearFarScalar(1e4, 1.2, 8e6, 0.3),
        };
        entity.properties = new Cesium.PropertyBag({ entityType: "earthquakes", itemId: q.id });
      },
    });
    viewerRef.current.scene.requestRender();
  }, [earthquakes, layers.earthquakes]);

  // ── Ruler tool rendering ────────────────────────────────────────────────────
  useEffect(() => {
    const source = rulerSourceRef.current;
    const viewer = viewerRef.current;
    if (!source || !viewer) return;

    source.entities.removeAll();

    if (ruler.points.length === 0) {
      viewer.scene.requestRender();
      return;
    }

    const amberColor = Cesium.Color.fromCssColorString("#f59e0b");
    const amberGlow = Cesium.Color.fromCssColorString("#f59e0b").withAlpha(0.3);

    // Anchor points
    ruler.points.forEach((pt, i) => {
      source.entities.add({
        id: `ruler-pt-${i}`,
        position: toCartesian(pt.longitude, pt.latitude),
        point: {
          pixelSize: i === 0 ? 10 : 8,
          color: amberColor,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: i === 0 ? "START" : `P${i}`,
          font: "500 9px 'JetBrains Mono', monospace",
          fillColor: amberColor,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          show: true,
        },
      });
    });

    // Polyline segments
    if (ruler.points.length >= 2) {
      const positions = ruler.points.map(p => toCartesian(p.longitude, p.latitude));
      source.entities.add({
        id: "ruler-line",
        polyline: {
          positions,
          width: 2.5,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: amberColor,
          }),
          clampToGround: false,
        },
      });

      // Segment distance labels
      ruler.points.forEach((pt, i) => {
        if (i === 0) return;
        const prev = ruler.points[i - 1];
        const midLon = (pt.longitude + prev.longitude) / 2;
        const midLat = (pt.latitude + prev.latitude) / 2;
        const dist = ruler.segmentDistances[i - 1] ?? 0;
        const label = formatRulerDistance(dist, ruler.unit);
        source.entities.add({
          id: `ruler-seg-${i}`,
          position: toCartesian(midLon, midLat),
          label: {
            text: label,
            font: "600 10px 'JetBrains Mono', monospace",
            fillColor: amberColor,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            show: true,
          },
        });
      });
    }

    viewer.scene.requestRender();
  }, [ruler]);

  // ── Fly-to selected entity ──────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !selectedEntity) return;

    let target: { lon: number; lat: number; alt: number } | null = null;

    if (selectedEntity.type === "aircraft") {
      const a = aircraft.find(x => x.id === selectedEntity.id);
      if (a?.latitude != null && a?.longitude != null) {
        target = { lon: a.longitude, lat: a.latitude, alt: altitudeForSelection("aircraft", a.altitude) };
      }
    } else if (selectedEntity.type === "satellites") {
      const s = satellites.find(x => x.id === selectedEntity.id);
      if (s) target = { lon: s.longitude, lat: s.latitude, alt: altitudeForSelection("satellites", s.altitude) };
    } else if (selectedEntity.type === "earthquakes") {
      const q = earthquakes.find(x => x.id === selectedEntity.id);
      if (q) target = { lon: q.longitude, lat: q.latitude, alt: 500_000 };
    } else if (selectedEntity.type === "webcams") {
      const w = webcams.find(x => x.id === selectedEntity.id);
      if (w) target = { lon: w.longitude, lat: w.latitude, alt: 200_000 };
    }

    if (target) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(target.lon, target.lat, target.alt),
        duration: 1.8,
        easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      });
    }
  }, [selectedEntity]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cursor style for ruler mode ─────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = ruler.active ? "crosshair" : "default";
  }, [ruler.active]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    />
  );
}

// ─── Ruler distance formatter ─────────────────────────────────────────────────
function formatRulerDistance(km: number, unit: "km" | "nm" | "mi"): string {
  if (unit === "nm") return `${(km * 0.539957).toFixed(1)} NM`;
  if (unit === "mi") return `${(km * 0.621371).toFixed(1)} mi`;
  return km >= 1000 ? `${(km / 1000).toFixed(2)} Mm` : `${km.toFixed(1)} km`;
}
