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
- [x] All 18 tests passing

## Deployment
- [ ] Save checkpoint and publish
