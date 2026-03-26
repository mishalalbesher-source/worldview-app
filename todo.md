# WorldView - Real-Time Earth Dashboard TODO

## Backend
- [x] Install socket.io and node-fetch dependencies
- [x] Create WebSocket manager (server/wsManager.ts)
- [x] Create OpenSky aircraft polling worker (server/workers/flightWorker.ts)
- [x] Create satellite position worker with TLE data (server/workers/satelliteWorker.ts)
- [x] Create USGS earthquake polling worker (server/workers/earthquakeWorker.ts)
- [x] Create weather overlay + Open-Meteo worker (server/workers/weatherWorker.ts)
- [x] Create webcam catalog service (server/workers/webcamWorker.ts)
- [x] Register Socket.io in server/_core/index.ts
- [x] Add tRPC routes for health, snapshot, webcam proxy
- [x] Add webcam snapshot proxy endpoint

## Frontend
- [x] Install cesium npm package (using CDN instead)
- [x] Install zustand for state management
- [x] Configure vite for CesiumJS (CDN-based, no local assets)
- [x] Create Zustand store (client/src/store/useStore.ts)
- [x] Create WebSocket hook (client/src/hooks/useWorldViewSocket.ts)
- [x] Create CesiumViewer component (client/src/components/globe/CesiumViewer.tsx)
- [x] Create Dashboard layout component (client/src/pages/WorldView.tsx)
- [x] Create left panel (feed status, layer controls)
- [x] Create right panel (entity details, webcam snapshots)
- [x] Create bottom panel (aircraft list, satellite list, earthquake list)
- [x] Create telemetry analytics charts
- [x] Wire up App.tsx to WorldView page
- [x] Dark theme with space-inspired design
- [x] Fix fly-to functionality for entity selection
- [x] Fix imagery preset switching (Street Map, Natural Earth, Dark Globe)
- [x] Remove old local Cesium assets from client/public (using CDN)

## Testing
- [x] Write vitest for WorldView data normalization utilities
- [x] Write vitest for earthquake data normalization
- [x] All 41 tests passing (18 original + 23 new classification/ruler tests)

## Deployment
- [x] Save checkpoint and publish

## Redesign Phase
- [x] Full color system redesign - new dark operational theme (C2/military-hybrid)
- [x] New typography pairing (analytical platform feel)
- [x] CSS design tokens / variables overhaul
- [x] Light theme toggle
- [x] Aircraft classification: military vs civilian visual differentiation
- [x] Military sub-types: Fighter, ISR, Transport, UAV
- [x] Aircraft classification legend panel
- [x] Military/civilian filter toggle
- [x] Professional SVG icon set (unified stroke/scale)
- [x] Distance measurement ruler tool (click-to-measure, great-circle)
- [x] Ruler: segment + total distance display
- [x] Ruler: km / NM / miles unit toggle
- [x] Ruler: draggable anchor points, reset/delete
- [x] UI layout overhaul - grid-based analytical platform composition
- [x] Glow/emphasis effects for selected objects

## Major Upgrade Phase (OSINT Intelligence Platform)
- [x] Maritime AIS vessel tracking layer (AISStream.io WebSocket, demo mode active)
- [x] Ship icons, vessel type classification, route trails on globe
- [x] Vessel detail panel (MMSI, flag, type, speed, destination, ETA)
- [x] Timeline/playback system - live mode + historical scrubbing
- [x] History buffer (server-side ring buffer for last 2h of positions)
- [x] Timeline scrubber UI component with play/pause/speed controls
- [x] Anomaly detection engine (route deviation, clustering, disappearance)
- [x] Anomaly alert panel with severity levels (scrollable, acknowledge action)
- [x] Advanced layer filters (vessel category, aircraft class, earthquake magnitude)
- [ ] Satellite future pass projection (next 90 min orbit path) - deferred
- [x] Entity detail panel upgrade - vessel detail with full metadata
- [x] Alert/event notification panel (anomaly panel in left sidebar)
- [x] Performance: maxVisible cap on vessel layer (500), aircraft list capped at 80
- [x] Modular codebase refactor - separate workers (flight/maritime/earthquake/satellite/weather)
- [x] Update vitest tests - 41 tests passing

## Production Integration Fix
- [x] Diagnose WebSocket/Socket.IO connection failure in production
- [x] Fix Socket.IO CORS and transport config for production domain
- [x] Fix API endpoint paths for production (no Vite proxy)
- [x] Fix Socket.IO path changed from /ws to /socket.io (production proxy compatible)
- [x] Verify all data feeds work after deployment

## Icon Redesign
- [x] Larger, clearer aircraft icon (44px airliner silhouette for civilian, 44px delta-wing for military)
- [x] Callsign label always visible below each aircraft icon (bold 12px, dark outline, fade at altitude)
- [x] Distinct vessel/ship icon (40px hull with bow arrow, glow ring, vessel name label always visible)
- [x] Webcam icon (36px camera body with lens + recording dot, location name label always visible)
- [x] Military aircraft use distinct color/icon vs civilian (orange/red delta-wing vs cyan airliner)
- [x] Save checkpoint and redeploy
