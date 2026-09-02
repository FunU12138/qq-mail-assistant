"use strict";

const http = require("http");
const path = require("path");
const { loadConfig } = require("./config.cjs");
const { createLogger, redact } = require("./logger.cjs");
const { createHandlers, semanticTools } = require("./tools.cjs");

const HOST = process.env.QQ_MAIL_ASSISTANT_HOST || "127.0.0.1";
const PORT = Number(process.env.QQ_MAIL_ASSISTANT_PORT || "3050");
const VERSION = "0.1.0";
const MCP_PROTOCOL_VERSION = "2026-07-28";

function sendJson(res, payload, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache"
  });
  res.end(JSON.stringify(payload));
}

function sendMcp(res, req, payload) {
  const accept = req.headers.accept || "";
  if (accept.includes("text/event-stream")) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    });
    res.end(`data: ${JSON.stringify(payload)}\n\n`);
    return;
  }
  sendJson(res, payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 10 * 1024 * 1024) reject(new Error("request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function jsonResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, data: redact(data) } };
}

function normalizeError(error, action) {
  const message = error?.message || String(error);
  let error_type = "unknown_error";
  if (/auth|login|password|credential|authorization/i.test(message)) error_type = "authentication_failed";
  else if (/mailbox|not found/i.test(message)) error_type = "mailbox_not_found";
  else if (/timeout|network|ENOTFOUND|ECONN/i.test(message)) error_type = "network_error";
  else if (/invalid|required|missing/i.test(message)) error_type = "invalid_argument";
  return { success: false, error_type, message, action };
}

function summarizeArgs(args = {}) {
  return {
    keys: Object.keys(args),
    mailbox: args.mailbox,
    uid: args.uid,
    limit: args.limit,
    query_length: typeof args.query === "string" ? args.query.length : undefined,
    subject_length: typeof args.subject === "string" ? args.subject.length : undefined,
    text_length: typeof args.text === "string" ? args.text.length : undefined,
    html_length: typeof args.html === "string" ? args.html.length : undefined,
    attachment_count: Array.isArray(args.attachments) ? args.attachments.length : undefined
  };
}

function createServer(config = loadConfig()) {
  const logger = createLogger(path.join(config.paths.runtimeDir, "assistant.ndjson"));
  const handlers = createHandlers(config, logger);
  const bearerToken = process.env.QQ_MAIL_MCP_BEARER_TOKEN || "";

  function authorize(req, res, url) {
    if (!bearerToken) return true;
    if (url.pathname === "/healthz" || url.pathname.startsWith("/.well-known/oauth-protected-resource")) return true;
    const auth = req.headers.authorization || "";
    if (auth === `Bearer ${bearerToken}`) return true;
    sendJson(res, { error: "unauthorized" }, 401);
    return false;
  }

  async function handleMessage(message) {
    const { id, method, params } = message;
    try {
      if (method === "initialize") {
        return jsonResponse(id, {
          protocolVersion: params?.protocolVersion || MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "QQ Mail Assistant", version: VERSION },
          instructions: "Use QQ Mail semantic tools. Draft tools create real QQ Mail drafts and never send mail by default."
        });
      }
      if (method === "ping") return jsonResponse(id, {});
      if (method === "server/discover") {
        return jsonResponse(id, {
          resultType: "complete",
          supportedVersions: [MCP_PROTOCOL_VERSION],
          capabilities: { tools: { listChanged: false } },
          _meta: { "io.modelcontextprotocol/serverInfo": { name: "QQ Mail Assistant", version: VERSION } },
          ttlMs: 0,
          cacheScope: "private"
        });
      }
      if (method === "tools/list") {
        return jsonResponse(id, { resultType: "complete", ttlMs: 0, cacheScope: "private", tools: semanticTools });
      }
      if (method === "tools/call") {
        const name = params?.name;
        const args = params?.arguments || {};
        const handler = handlers[name];
        if (!handler) return errorResponse(id, -32602, `Unknown tool: ${name}`);
        logger.info("tool_call", { name, args: summarizeArgs(args) });
        const result = await handler(args);
        return jsonResponse(id, {
          resultType: "complete",
          content: [{ type: "text", text: JSON.stringify(redact(result), null, 2) }],
          isError: false
        });
      }
      return errorResponse(id, -32601, `Method not found: ${method}`);
    } catch (error) {
      logger.error("tool_error", { method, error: normalizeError(error, method) });
      return errorResponse(id, -32603, error.message || String(error), normalizeError(error, method));
    }
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
      if (url.pathname === "/healthz") {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end("live");
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
        sendJson(res, { resource: process.env.QQ_MAIL_PUBLIC_MCP_URL || `http://${HOST}:${PORT}/mcp`, authorization_servers: [], scopes_supported: [] });
        return;
      }
      if (!authorize(req, res, url)) return;
      if (url.pathname !== "/mcp") return sendJson(res, { error: "not found" }, 404);
      if (req.method !== "POST") return sendJson(res, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }, 405);
      const body = await readJson(req);
      if (!Array.isArray(body) && !("id" in body)) {
        res.writeHead(202);
        res.end();
        return;
      }
      const result = Array.isArray(body)
        ? await Promise.all(body.filter(item => "id" in item).map(handleMessage))
        : await handleMessage(body);
      sendMcp(res, req, result);
    } catch (error) {
      sendMcp(res, req, errorResponse(null, -32700, error.message || String(error)));
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`QQ Mail Assistant listening on http://${HOST}:${PORT}/mcp`);
  });
}

module.exports = { createServer, normalizeError };
