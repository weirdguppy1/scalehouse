import { env } from "./config/env";
import { createApp } from "./app";
import { logger } from "./services/logger.service";
import { gracefullyCloseServer } from "./services/shutdown.service";

const app = createApp();

const server = app.listen(env.port, env.host, () => {
  console.log(`Server running on port ${env.port}`);
  console.log("Health: /api/health");
  console.log("Vapi webhook: /webhooks/vapi");
});

let shuttingDown = false;
const shutdown = (signal: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  void gracefullyCloseServer(server, signal).then((graceful) => { if (!graceful) process.exitCode = 1; });
};
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (error) => { logger.error("Uncaught exception", { error: error.message }); shutdown("uncaughtException"); });
process.on("unhandledRejection", (reason) => logger.error("Unhandled rejection", { error: reason instanceof Error ? reason.message : "Unknown rejection" }));
