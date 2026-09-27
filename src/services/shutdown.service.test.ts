import assert from "node:assert/strict";
import test from "node:test";
import type { Server } from "node:http";
import { gracefullyCloseServer } from "./shutdown.service";

test("graceful shutdown resolves when server closes", async () => {
  const server = { close: (callback: (error?: Error) => void) => { callback(); return server; } } as unknown as Server;
  assert.equal(await gracefullyCloseServer(server, "SIGTERM", 100), true);
});

test("graceful shutdown has a bounded fallback", async () => {
  let forced = false;
  const server = { close: () => server, closeAllConnections: () => { forced = true; } } as unknown as Server;
  assert.equal(await gracefullyCloseServer(server, "SIGINT", 10), false);
  assert.equal(forced, true);
});
