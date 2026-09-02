"use strict";

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadConfig() {
  const configPath = process.env.QQ_MAIL_CONFIG || path.join(PROJECT_ROOT, "config", "local.json");
  const fallbackPath = path.join(PROJECT_ROOT, "config", "example.json");
  const config = fs.existsSync(configPath) ? readJson(configPath) : readJson(fallbackPath);
  const authCode = process.env.QQ_MAIL_AUTH_CODE;
  if (!config.account?.email) throw new Error("Missing account.email in config.");
  return {
    ...config,
    auth: {
      user: config.account.email,
      authCode
    },
    paths: {
      projectRoot: PROJECT_ROOT,
      runtimeDir: process.env.QQ_MAIL_RUNTIME_DIR || path.join(PROJECT_ROOT, "runtime"),
      outgoingDir: process.env.QQ_MAIL_OUTGOING_DIR || path.join(PROJECT_ROOT, "outgoing")
    }
  };
}

function requireAuth(config) {
  if (!config.auth?.authCode) {
    throw new Error("Missing QQ_MAIL_AUTH_CODE environment variable.");
  }
}

module.exports = { PROJECT_ROOT, loadConfig, requireAuth };
