import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initManager } from "../wsManager";
import { startFlightWorker } from "../workers/flightWorker";
import { startSatelliteWorker } from "../workers/satelliteWorker";
import { startEarthquakeWorker } from "../workers/earthquakeWorker";
import { startWeatherWorker } from "../workers/weatherWorker";
import { startWebcamWorker, CURATED_WEBCAMS } from "../workers/webcamWorker";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Initialize WebSocket manager (Socket.io)
  const manager = initManager(server);

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // WorldView REST endpoints
  app.get("/api/health", (_req, res) => {
    const snapshot = manager.getSnapshot();
    res.json({ status: "ok", websocketPath: "/ws", feedStatus: snapshot.feedStatus, timestamp: snapshot.timestamp });
  });

  app.get("/api/dashboard/snapshot", (_req, res) => {
    res.json(manager.getSnapshot());
  });

  app.get("/api/webcams", (_req, res) => {
    res.json({ items: CURATED_WEBCAMS.map(cam => ({ ...cam, proxySnapshotUrl: `/api/webcams/${cam.id}/snapshot` })) });
  });

  app.get("/api/webcams/:webcamId/snapshot", async (req, res) => {
    const webcam = CURATED_WEBCAMS.find(c => c.id === req.params.webcamId);
    if (!webcam) { res.status(404).json({ error: "Unknown webcam" }); return; }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const imgRes = await fetch(webcam.snapshotUrl, { signal: controller.signal, headers: { "User-Agent": "worldview-app/1.0" } });
      clearTimeout(timeout);
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
      const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
      const buffer = await imgRes.arrayBuffer();
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=60");
      res.send(Buffer.from(buffer));
    } catch {
      res.set("Content-Type", "image/svg+xml");
      res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#1e293b"/><text x="160" y="95" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="13">${webcam.name} - unavailable</text></svg>`);
    }
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start background workers after server is listening
    startFlightWorker(manager).catch(console.error);
    startSatelliteWorker(manager).catch(console.error);
    startEarthquakeWorker(manager).catch(console.error);
    startWeatherWorker(manager).catch(console.error);
    startWebcamWorker(manager).catch(console.error);
    console.log("[WorldView] Background workers started");
  });
}

startServer().catch(console.error);
