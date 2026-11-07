import { createServer, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {createServer as createMcpServer,buildRegistry} from "./index.js";
const registry=buildRegistry();
const port = Number(process.env.PORT ?? 3000);
const hosts = new Set(["localhost", "127.0.0.1", process.env.RAILWAY_PUBLIC_DOMAIN, process.env.PUBLIC_HOST].filter(Boolean));
const origins = new Set((process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean));
let active = 0;
let windowStart = Date.now();
let requests = 0;

function respond(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

const http = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  // Railway's health checker uses its own Host header.
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", mode: "anonymous-explicit-retailers", tools: 7 }));
    return;
  }
  const host = (req.headers.host ?? "").split(":")[0];
  if (!hosts.has(host)) return respond(res, 403, "Invalid host");
  const origin = req.headers.origin;
  if (origin && origin !== `https://${req.headers.host}` && origin !== `http://${req.headers.host}` && !origins.has(origin)) {
    return respond(res, 403, "Origin not allowed");
  }
  if (req.url !== "/mcp") return respond(res, 404, "Not found");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, "Use POST for stateless MCP");
  }
  if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    return respond(res, 415, "Expected application/json");
  }
  if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0; }
  if (++requests > 300 || active >= 8) {
    res.setHeader("Retry-After", "60");
    return respond(res, 429, "Server busy; retry later");
  }
  active++;
  const server = await createMcpServer(registry);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    active--;
    clearTimeout(deadline);
    void server.close();
  };
  const deadline = setTimeout(() => {
    if (!res.headersSent) respond(res, 504, "Upstream request timed out");
    else res.destroy();
  }, 40_000);
  res.once("close", cleanup);
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65_536) { respond(res, 413, "Request body too large"); return; }
      chunks.push(Buffer.from(chunk));
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { respond(res, 400, "Invalid JSON"); return; }
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch {
    if (!res.headersSent) respond(res, 500, "MCP request failed");
    else res.destroy();
  }
});

http.requestTimeout = 45_000;
http.headersTimeout = 10_000;
http.listen(port, "0.0.0.0", () => console.log(`Hardened SwissGroceries MCP listening on port ${port}`));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
