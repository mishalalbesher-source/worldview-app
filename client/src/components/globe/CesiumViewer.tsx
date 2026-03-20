import { useEffect, useRef, useState } from "react";
import useStore from "@/store/useStore";
import type { Aircraft, Satellite, Earthquake, Webcam } from "@/store/useStore";

// Cesium is loaded via CDN script tag in index.html
declare const Cesium: any;

const CESIUM_BASE_URL = "/";

// Canvas-drawn icons (avoid SVG data URI decode issues in Cesium)
function makeCanvasIcon(drawFn: (ctx: CanvasRenderingContext2D, size: number) => void, size = 24): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  drawFn(ctx, size);
  return canvas;
}

function getPlaneIcon() {
  return makeCanvasIcon((ctx, s) => {
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.moveTo(s/2, 2); ctx.lineTo(s/2+3, s/2); ctx.lineTo(s-2, s*0.7);
    ctx.lineTo(s/2+1, s*0.6); ctx.lineTo(s/2+1, s-3);
    ctx.lineTo(s/2, s-2); ctx.lineTo(s/2-1, s-3);
    ctx.lineTo(s/2-1, s*0.6); ctx.lineTo(2, s*0.7);
    ctx.lineTo(s/2-3, s/2); ctx.closePath();
    ctx.fill();
  });
}

function getSatelliteIcon() {
  return makeCanvasIcon((ctx, s) => {
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s*0.2, s*0.5); ctx.lineTo(s*0.8, s*0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s*0.5, s*0.2); ctx.lineTo(s*0.5, s*0.8); ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.fillRect(s*0.1, s*0.42, s*0.25, s*0.16);
    ctx.fillRect(s*0.65, s*0.42, s*0.25, s*0.16);
    ctx.beginPath(); ctx.arc(s/2, s/2, s*0.12, 0, Math.PI*2); ctx.fill();
  });
}

function getCameraIcon() {
  return makeCanvasIcon((ctx, s) => {
    ctx.fillStyle = '#34d399';
    ctx.beginPath();
    ctx.roundRect(s*0.1, s*0.3, s*0.8, s*0.55, 3);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(s/2, s*0.57, s*0.18, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#34d399';
    ctx.beginPath(); ctx.arc(s/2, s*0.57, s*0.1, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#34d399';
    ctx.fillRect(s*0.38, s*0.22, s*0.24, s*0.1);
  });
}

function makeLabel(text: string, color?: any) {
  return {
    text: text || "",
    font: "11px sans-serif",
    fillColor: color || Cesium.Color.CYAN,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cesium.Cartesian2(0, -18),
    scaleByDistance: new Cesium.NearFarScalar(1e4, 1.0, 6e6, 0.0),
    show: true,
  };
}

function altitudeForSelection(type: string, altitude?: number | null): number {
  if (type === "satellites") return (altitude ?? 400_000) + 200_000;
  if (type === "aircraft") return (altitude ?? 10_000) + 50_000;
  return 500_000;
}

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

export default function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const aircraftSourceRef = useRef<any>(null);
  const satelliteSourceRef = useRef<any>(null);
  const webcamSourceRef = useRef<any>(null);
  const earthquakeSourceRef = useRef<any>(null);
  const weatherLayerRef = useRef<any>(null);
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
  const setSelectedEntity = useStore(s => s.setSelectedEntity);
  const setSelectedEntityRef = useRef(setSelectedEntity);
  setSelectedEntityRef.current = setSelectedEntity;

  // Initialize Cesium viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
    if (typeof Cesium === "undefined") {
      console.error("[CesiumViewer] Cesium not loaded");
      return;
    }

    // Disable Ion to prevent 401 errors - we use OSM instead
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

    // Suppress render errors so the globe keeps running
    viewer.scene.renderError.addEventListener((_scene: any, error: any) => {
      console.warn('[CesiumViewer] Render error suppressed:', error?.message || error);
    });

    // Entity data sources
    const aircraftSource = new Cesium.CustomDataSource("aircraft");
    const satelliteSource = new Cesium.CustomDataSource("satellites");
    const webcamSource = new Cesium.CustomDataSource("webcams");
    const earthquakeSource = new Cesium.CustomDataSource("earthquakes");
    viewer.dataSources.add(aircraftSource);
    viewer.dataSources.add(satelliteSource);
    viewer.dataSources.add(webcamSource);
    viewer.dataSources.add(earthquakeSource);

    aircraftSourceRef.current = aircraftSource;
    satelliteSourceRef.current = satelliteSource;
    webcamSourceRef.current = webcamSource;
    earthquakeSourceRef.current = earthquakeSource;
    viewerRef.current = viewer;
    setViewerReady(true);

    // Apply initial imagery using Natural Earth II (bundled with Cesium, no external requests)
    try {
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(
        new Cesium.TileMapServiceImageryProvider({ url: Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII") })
      );
    } catch (e) {
      console.warn("[CesiumViewer] Initial imagery error:", e);
    }

    // Click handler for entity selection
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
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

  // Imagery preset
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      viewer.imageryLayers.removeAll();
      if (imageryPreset === "osm") {
        // Use OSM tiles - great for street-level detail
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            credit: "© OpenStreetMap contributors",
            maximumLevel: 19,
          })
        );
      } else if (imageryPreset === "dark" || imageryPreset === "ion") {
        // Natural Earth II - bundled with Cesium, no external requests
        viewer.imageryLayers.addImageryProvider(
          new Cesium.TileMapServiceImageryProvider({ url: Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII") })
        );
      } else {
        viewer.imageryLayers.addImageryProvider(
          new Cesium.TileMapServiceImageryProvider({ url: Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII") })
        );
      }
    } catch (e) {
      console.warn("[CesiumViewer] Imagery provider error:", e);
    }
    viewer.scene.requestRender();
  }, [imageryPreset]);

  // Weather overlay
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
      } catch {
        // ignore
      }
    }
    viewer.scene.requestRender();
  }, [weatherConfig, layers.weather.visible, layers.weather.opacity]);

  // Aircraft
  useEffect(() => {
    if (!aircraftSourceRef.current || !viewerRef.current) return;
    const visibleAircraft = layers.aircraft.visible
      ? aircraft.filter(p => p.latitude !== null && p.longitude !== null).slice(0, layers.aircraft.maxVisible ?? 1500)
      : [];

    syncCollection<Aircraft>({
      source: aircraftSourceRef.current,
      mapRef: aircraftEntitiesRef,
      items: visibleAircraft,
      idPrefix: "aircraft",
      buildEntity: (entity, plane) => {
        entity.name = plane.callsign || plane.id;
        entity.position = Cesium.Cartesian3.fromDegrees(plane.longitude!, plane.latitude!, plane.altitude ?? 0);
        entity.billboard = new Cesium.BillboardGraphics({
          image: getPlaneIcon(),
          scale: 1.0,
          rotation: Cesium.Math.toRadians(-(plane.heading ?? 0)),
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          scaleByDistance: new Cesium.NearFarScalar(1e4, 1.2, 8e6, 0.4),
          color: plane.onGround ? Cesium.Color.GRAY : Cesium.Color.WHITE,
        });
        entity.point = undefined;
        if (layers.aircraft.showTrails && plane.trail && plane.trail.length > 1) {
          const positions = plane.trail.map((p: number[]) => Cesium.Cartesian3.fromDegrees(p[0], p[1], p[2] ?? 0));
          entity.polyline = new Cesium.PolylineGraphics({
            positions,
            width: 1.5,
            material: new Cesium.PolylineGlowMaterialProperty({ color: Cesium.Color.CYAN.withAlpha(0.75), glowPower: 0.12 }),
          });
        } else {
          entity.polyline = null;
        }
        entity.label = layers.aircraft.showLabels ? makeLabel(plane.callsign || plane.id) : undefined;
        entity.properties = new Cesium.PropertyBag({ entityType: "aircraft", itemId: plane.id });
      },
    });
    viewerRef.current.scene.requestRender();
  }, [aircraft, layers.aircraft, viewerReady]);

  // Satellites
  useEffect(() => {
    if (!satelliteSourceRef.current || !viewerRef.current) return;
    const visibleSats = layers.satellites.visible
      ? satellites.filter(s => isFinite(s.latitude) && isFinite(s.longitude)).slice(0, layers.satellites.maxVisible ?? 120)
      : [];

    syncCollection<Satellite>({
      source: satelliteSourceRef.current,
      mapRef: satelliteEntitiesRef,
      items: visibleSats,
      idPrefix: "satellite",
      buildEntity: (entity, sat) => {
        entity.name = sat.name;
        entity.position = Cesium.Cartesian3.fromDegrees(sat.longitude, sat.latitude, sat.altitude ?? 400_000);
        entity.billboard = new Cesium.BillboardGraphics({
          image: getSatelliteIcon(),
          scale: 0.94,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          scaleByDistance: new Cesium.NearFarScalar(5e4, 1.1, 1.2e7, 0.45),
        });
        entity.point = undefined;
        if (layers.satellites.showOrbits && sat.orbit && sat.orbit.length > 1) {
          const orbitPositions = sat.orbit.map((p: number[]) => Cesium.Cartesian3.fromDegrees(p[0], p[1], p[2] ?? 0));
          entity.polyline = new Cesium.PolylineGraphics({
            positions: orbitPositions,
            width: 1.6,
            material: Cesium.Color.YELLOW.withAlpha(0.72),
          });
        } else {
          entity.polyline = null;
        }
        entity.label = layers.satellites.showLabels ? makeLabel(sat.name, Cesium.Color.YELLOW) : undefined;
        entity.properties = new Cesium.PropertyBag({ entityType: "satellites", itemId: sat.id });
      },
    });
    viewerRef.current.scene.requestRender();
  }, [satellites, layers.satellites, viewerReady]);

  // Webcams
  useEffect(() => {
    if (!webcamSourceRef.current || !viewerRef.current) return;
    const visibleWebcams = layers.webcams.visible
      ? webcams.filter(w => isFinite(w.latitude) && isFinite(w.longitude)).slice(0, layers.webcams.maxVisible ?? 60)
      : [];

    syncCollection<Webcam>({
      source: webcamSourceRef.current,
      mapRef: webcamEntitiesRef,
      items: visibleWebcams,
      idPrefix: "webcam",
      buildEntity: (entity, webcam) => {
        entity.name = webcam.name;
        entity.position = Cesium.Cartesian3.fromDegrees(webcam.longitude, webcam.latitude, 2_500);
        entity.billboard = new Cesium.BillboardGraphics({
          image: getCameraIcon(),
          scale: 0.9,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          scaleByDistance: new Cesium.NearFarScalar(1e4, 1.1, 6e6, 0.35),
        });
        entity.point = undefined;
        entity.properties = new Cesium.PropertyBag({ entityType: "webcams", itemId: webcam.id });
      },
    });
    viewerRef.current.scene.requestRender();
  }, [webcams, layers.webcams, viewerReady]);

  // Earthquakes
  useEffect(() => {
    if (!earthquakeSourceRef.current || !viewerRef.current) return;
    const visibleQuakes = layers.earthquakes.visible
      ? earthquakes.filter(e => isFinite(e.latitude) && isFinite(e.longitude)).slice(0, layers.earthquakes.maxVisible ?? 150)
      : [];

    syncCollection<Earthquake>({
      source: earthquakeSourceRef.current,
      mapRef: earthquakeEntitiesRef,
      items: visibleQuakes,
      idPrefix: "earthquake",
      buildEntity: (entity, quake) => {
        const mag = quake.magnitude ?? 0;
        const radius = Math.max(8, Math.min(40, mag * 6));
        const alpha = Math.min(1, 0.4 + mag * 0.08);
        const color = mag >= 6 ? Cesium.Color.RED.withAlpha(alpha)
          : mag >= 4 ? Cesium.Color.ORANGE.withAlpha(alpha)
          : Cesium.Color.YELLOW.withAlpha(alpha);
        entity.name = quake.title;
        entity.position = Cesium.Cartesian3.fromDegrees(quake.longitude, quake.latitude, 0);
        entity.point = new Cesium.PointGraphics({
          pixelSize: radius,
          color,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.5),
          outlineWidth: 1,
          scaleByDistance: new Cesium.NearFarScalar(1e4, 1.2, 8e6, 0.4),
        });
        entity.billboard = undefined;
        entity.label = layers.earthquakes.showLabels ? makeLabel(`M${mag.toFixed(1)}`, Cesium.Color.ORANGE) : undefined;
        entity.properties = new Cesium.PropertyBag({ entityType: "earthquakes", itemId: quake.id });
      },
    });
    viewerRef.current.scene.requestRender();
  }, [earthquakes, layers.earthquakes, viewerReady]);

  // Camera fly-to on entity selection
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !selectedEntity) return;
    const store = useStore.getState();
    const dataMap: Record<string, any[]> = {
      aircraft: store.aircraft,
      satellites: store.satellites,
      webcams: store.webcams,
      earthquakes: store.earthquakes,
    };
    const items = dataMap[selectedEntity.type] ?? [];
    const item = items.find((i: any) => i.id === selectedEntity.id);
    if (!item || !isFinite(item.latitude) || !isFinite(item.longitude)) return;
    const altitude = altitudeForSelection(selectedEntity.type, item.altitude);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        item.longitude,
        item.latitude,
        altitude
      ),
      duration: 1.6,
    });
  }, [selectedEntity, viewerReady]);

  const visualFilter =
    visualMode === "green" ? "sepia(0.72) hue-rotate(42deg) saturate(1.25) contrast(1.12) brightness(0.9)"
    : visualMode === "mono" ? "grayscale(1) contrast(1.2) brightness(0.92)"
    : "none";

  return <div ref={containerRef} className="h-full w-full" style={{ filter: visualFilter }} />;
}
