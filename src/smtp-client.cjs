"use strict";

const tls = require("tls");

class SmtpClient {
  constructor(options) {
    this.options = options;
    this.socket = null;
  }

  async connect() {
    this.socket = tls.connect({
      host: this.options.host,
      port: this.options.port || 465,
      servername: this.options.host,
      rejectUnauthorized: this.options.rejectUnauthorized !== false
    });
    await onceSecure(this.socket);
    await this.readResponse();
  }

  async login(user, authCode) {
    await this.command(`EHLO localhost`);
    await this.command("AUTH LOGIN");
    await this.command(Buffer.from(user, "utf8").toString("base64"));
    await this.command(Buffer.from(authCode, "utf8").toString("base64"));
  }

  close() {
    if (this.socket) this.socket.end();
  }

  async command(line) {
    this.socket.write(`${line}\r\n`, "utf8");
    return this.readResponse();
  }

  readResponse() {
    return new Promise((resolve, reject) => {
      let text = "";
      const onData = chunk => {
        text += chunk.toString("utf8");
        const lines = text.split(/\r?\n/).filter(Boolean);
        const last = lines[lines.length - 1] || "";
        if (/^\d{3} /.test(last)) {
          cleanup();
          const code = Number(last.slice(0, 3));
          if (code >= 400) reject(new Error(`SMTP error ${code}`));
          else resolve(text);
        }
      };
      const onError = error => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        this.socket.off("data", onData);
        this.socket.off("error", onError);
      };
      this.socket.on("data", onData);
      this.socket.on("error", onError);
    });
  }
}

function onceSecure(socket) {
  return new Promise((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });
}

module.exports = { SmtpClient };
