import type { Server } from "node:http";
import { logger } from "./logger.service";

export const SHUTDOWN_TIMEOUT_MS = 10_000;

export function gracefullyCloseServer(server: Server, signal: string, timeoutMs = SHUTDOWN_TIMEOUT_MS): Promise<boolean> {
  logger.info("Shutdown requested", { signal });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (graceful: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (graceful) logger.info("Server stopped", { signal });
      else logger.error("Graceful shutdown timed out", { signal, timeoutMs });
      resolve(graceful);
    };
    const timer = setTimeout(() => {
      server.closeAllConnections?.();
      finish(false);
    }, timeoutMs);
    timer.unref();
    server.close((error) => {
      if (error) logger.error("Graceful shutdown failed", { signal, error: error.message });
      finish(!error);
    });
  });
}
