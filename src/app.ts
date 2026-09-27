import express, { type Express } from "express";
import { apiRouter } from "./routes";
import { createVapiWebhookRouter, type VapiWebhookDependencies } from "./routes/vapi-webhook";
import { requestLogger } from "./services/request-logger.service";

export function createApp(vapiDependencies: Partial<VapiWebhookDependencies> = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestLogger);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/webhooks/vapi", createVapiWebhookRouter(vapiDependencies));
  app.use("/api", apiRouter);
  app.use((_request, response) => response.status(404).json({ error: "Not found" }));
  return app;
}
