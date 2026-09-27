import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger } from "./logger.service";

export const requestLogger: RequestHandler = (request, response, next) => {
  const requestId = request.header("x-request-id")?.trim().slice(0, 128) || randomUUID();
  response.setHeader("x-request-id", requestId);
  const startedAt = performance.now();
  const path = request.originalUrl.split("?", 1)[0];
  response.once("finish", () => logger.info("HTTP request completed", {
    requestId, method: request.method, path, statusCode: response.statusCode,
    durationMs: Math.round(performance.now() - startedAt),
  }));
  next();
};
