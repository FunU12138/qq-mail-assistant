"use strict";

const fs = require("fs");
const path = require("path");

const SECRET_RE = /(auth[_-]?code|password|secret|token|authorization|credential|smtp_pass|imap_pass)/i;
const LONG_TEXT_KEYS = /(body|html|text|content|message)/i;

function redact(value, depth = 0) {
  if (depth > 6) return "[depth-limit]";
  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1));
  if (!value || typeof value !== "object") {
    if (typeof value === "string") {
      return value
        .replace(/([A-Za-z0-9]{4})[A-Za-z0-9]{8,}([A-Za-z0-9]{4})/g, "$1[redacted]$2")
        .slice(0, 500);
    }
    return value;
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_RE.test(key)) out[key] = "[redacted]";
    else if (LONG_TEXT_KEYS.test(key) && typeof item === "string") out[key] = `[redacted text length=${item.length}]`;
    else out[key] = redact(item, depth + 1);
  }
  return out;
}

function createLogger(logFile) {
  function write(level, event, data = {}) {
    const entry = redact({ time: new Date().toISOString(), level, event, ...data });
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  }
  return {
    info: (event, data) => write("info", event, data),
    warn: (event, data) => write("warn", event, data),
    error: (event, data) => write("error", event, data)
  };
}

module.exports = { createLogger, redact };
