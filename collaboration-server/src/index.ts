import { Server } from "@hocuspocus/server";
import { Logger } from "@hocuspocus/extension-logger";
import { onAuthenticate } from "./auth.js";
import type { UserContext } from "./auth.js";
import { createDatabaseExtension } from "./database.js";
import { createHealthCheckHandler } from "./health.js";

import type {
  onAuthenticatePayload,
  onConnectPayload,
  onDisconnectPayload,
  onRequestPayload,
} from "@hocuspocus/server";

/**
 * Validate that all required environment variables are present before the
 * server starts accepting connections. Without this, missing config (e.g.
 * JWT_SECRET) would only surface on the first WebSocket auth attempt instead
 * of failing fast at boot.
 */
function validateEnv(): void {
  const required = [
    "JWT_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

validateEnv();

const port = parseInt(process.env.PORT || "8080", 10);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [];

const healthCheck = createHealthCheckHandler();

const server = new Server({
  port,

  // Debounce persistence — persist after 30s of inactivity before unloading idle docs
  debounce: 30000,
  unloadImmediately: false,
  quiet: true,

  // Extensions
  extensions: [new Logger(), createDatabaseExtension()],

  // HTTP request hook — handles /health endpoint
  async onRequest({ request, response }: onRequestPayload) {
    return healthCheck(request, response);
  },

  // Authentication hook — validates JWT and returns user context
  async onAuthenticate(data: onAuthenticatePayload) {
    return onAuthenticate({ token: data.token });
  },

  // Connection hook — enforce allowed origins
  async onConnect({ request }: onConnectPayload) {
    if (allowedOrigins.length > 0 && !allowedOrigins.includes("*")) {
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) {
        throw new Error(`Origin ${origin} is not allowed`);
      }
    }
  },

  // Clean up awareness state when a user disconnects
  async onDisconnect({ document, context }: onDisconnectPayload) {
    const awareness = document.awareness;

    // Narrow the loosely-typed Hocuspocus context to our UserContext shape
    // via a runtime guard so a future change to the context structure surfaces
    // here instead of silently producing an unexpected value.
    const userContext =
      context && typeof context === "object" && "userId" in context
        ? (context as UserContext)
        : undefined;

    if (!awareness || !userContext?.userId) {
      return;
    }

    // Find and remove awareness states belonging to the disconnecting user
    const states = awareness.getStates();
    const clientIdsToRemove: number[] = [];

    for (const [clientId, state] of states) {
      if (state?.user?.userId === userContext.userId) {
        clientIdsToRemove.push(clientId);
      }
    }

    // Remove awareness states for the disconnected user's clients
    for (const clientId of clientIdsToRemove) {
      states.delete(clientId);
    }
  },
});

server.listen().then(() => {
  // Structured log to match the JSON log format used elsewhere (database.ts)
  console.log(
    JSON.stringify({
      event: "server_listening",
      port,
    })
  );
});
