import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";

export interface FeedStatus {
  source: string;
  status: "live" | "degraded" | "fallback" | "error" | "unknown";
  detail: string;
  itemCount: number;
  updatedAt: string;
  [key: string]: unknown;
}

export class WorldViewManager {
  private io: SocketIOServer;
  private lastMessages: Map<string, { type: string; data: unknown }> = new Map();
  private feedStatuses: Map<string, FeedStatus> = new Map();

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      // Use default path (/socket.io/) - do NOT set path explicitly to avoid conflicts
      cors: { origin: "*", methods: ["GET", "POST"] },
      transports: ["polling", "websocket"],
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 30000,
      allowEIO3: true,
    });

    this.io.on("connection", (socket: Socket) => {
      console.log(`[WS] Client connected: ${socket.id}`);
      // Send all cached messages to new client
      for (const message of Array.from(this.lastMessages.values())) {
        socket.emit("message", message);
      }
      // Send current feed statuses
      if (this.feedStatuses.size > 0) {
        const statusObj: Record<string, FeedStatus> = {};
        for (const [key, val] of Array.from(this.feedStatuses.entries())) {
          statusObj[key] = val;
        }
        socket.emit("message", { type: "feed_status", data: statusObj });
      }
      socket.on("disconnect", () => {
        console.log(`[WS] Client disconnected: ${socket.id}`);
      });
    });
  }

  broadcast(type: string, data: unknown): void {
    const message = { type, data };
    this.lastMessages.set(type, message);
    this.io.emit("message", message);
  }

  updateFeedStatus(source: string, payload: Partial<FeedStatus>): void {
    const status: FeedStatus = {
      source,
      status: payload.status ?? "unknown",
      detail: payload.detail ?? "",
      itemCount: payload.itemCount ?? 0,
      updatedAt: new Date().toISOString(),
      ...Object.fromEntries(
        Object.entries(payload).filter(([k]) => !["status", "detail", "itemCount"].includes(k))
      ),
    };
    this.feedStatuses.set(source, status);
    const statusObj: Record<string, FeedStatus> = {};
    for (const [key, val] of Array.from(this.feedStatuses.entries())) {
      statusObj[key] = val;
    }
    this.broadcast("feed_status", statusObj);
  }

  getSnapshot() {
    const messages: Record<string, unknown> = {};
    for (const [key, val] of Array.from(this.lastMessages.entries())) {
      messages[key] = val.data;
    }
    const feedStatus: Record<string, FeedStatus> = {};
    for (const [key, val] of Array.from(this.feedStatuses.entries())) {
      feedStatus[key] = val;
    }
    return { messages, feedStatus, timestamp: new Date().toISOString() };
  }

  getSocketIO(): SocketIOServer {
    return this.io;
  }
}

let managerInstance: WorldViewManager | null = null;

export function initManager(httpServer: HttpServer): WorldViewManager {
  managerInstance = new WorldViewManager(httpServer);
  return managerInstance;
}

export function getManager(): WorldViewManager {
  if (!managerInstance) throw new Error("WorldViewManager not initialized");
  return managerInstance;
}
