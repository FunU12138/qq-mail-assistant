"use strict";

const tls = require("tls");

class ImapClient {
  constructor(options) {
    this.options = options;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.tagNo = 1;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = tls.connect({
        host: this.options.host,
        port: this.options.port || 993,
        servername: this.options.host,
        rejectUnauthorized: this.options.rejectUnauthorized !== false
      });
      this.socket.once("secureConnect", async () => {
        try {
          await this.readUntilTaggedOrGreeting();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      this.socket.once("error", reject);
    });
  }

  close() {
    if (this.socket) this.socket.end();
  }

  async login(user, password) {
    const result = await this.command(`LOGIN ${quote(user)} ${quote(password)}`);
    if (!/ OK /i.test(result)) throw new Error("IMAP login failed.");
    return result;
  }

  async listMailboxes() {
    const text = await this.command('LIST "" "*"');
    return text.split(/\r?\n/)
      .filter(line => /^\* LIST/i.test(line))
      .map(line => {
        const match = line.match(/^\* LIST \(([^)]*)\) "([^"]*)" (.+)$/i);
        const rawName = match ? match[3].trim() : line.split(" ").pop();
        return {
          flags: match ? match[1].split(/\s+/).filter(Boolean) : [],
          delimiter: match ? match[2] : "/",
          name: decodeMailboxName(unquote(rawName))
        };
      });
  }

  async select(mailbox, readOnly = false) {
    return this.command(`${readOnly ? "EXAMINE" : "SELECT"} ${quote(mailbox)}`);
  }

  async search(criteria = "ALL") {
    const text = await this.command(`UID SEARCH ${criteria}`);
    const line = text.split(/\r?\n/).find(item => /^\* SEARCH/i.test(item)) || "";
    return line.replace(/^\* SEARCH\s*/i, "").trim().split(/\s+/).filter(Boolean).map(Number);
  }

  async fetchHeaders(uid) {
    const fields = "FROM TO CC SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES";
    const text = await this.command(`UID FETCH ${uid} (FLAGS RFC822.SIZE BODY.PEEK[HEADER.FIELDS (${fields})])`);
    return parseFetchHeaders(text, uid);
  }

  async fetchRaw(uid) {
    const text = await this.command(`UID FETCH ${uid} (RFC822)`);
    const marker = text.indexOf("\r\n");
    const endMarker = text.lastIndexOf("\r\n)");
    return endMarker > marker ? text.slice(marker + 2, endMarker) : text;
  }

  async append(mailbox, mime, flags = ["\\Draft"]) {
    const tag = this.nextTag();
    const bytes = Buffer.byteLength(mime, "utf8");
    this.socket.write(`${tag} APPEND ${quote(mailbox)} (${flags.join(" ")}) {${bytes}}\r\n`, "utf8");
    await this.readContinuation();
    this.socket.write(mime, "utf8");
    this.socket.write("\r\n", "utf8");
    const text = await this.readUntilTag(tag);
    if (!new RegExp(`^${tag} OK`, "im").test(text)) throw new Error(`IMAP APPEND failed: ${compact(text)}`);
    const uidMatch = text.match(/\[APPENDUID\s+\d+\s+(\d+)\]/i);
    return { mailbox, uid: uidMatch ? Number(uidMatch[1]) : undefined, raw: text };
  }

  async store(uid, flags) {
    return this.command(`UID STORE ${uid} ${flags}`);
  }

  async copy(uid, mailbox) {
    return this.command(`UID COPY ${uid} ${quote(mailbox)}`);
  }

  async expunge() {
    return this.command("EXPUNGE");
  }

  async command(command) {
    const tag = this.nextTag();
    this.socket.write(`${tag} ${command}\r\n`, "utf8");
    const text = await this.readUntilTag(tag);
    if (new RegExp(`^${tag} (NO|BAD)`, "im").test(text)) {
      throw new Error(`IMAP command failed: ${compact(text)}`);
    }
    return text;
  }

  nextTag() {
    return `A${String(this.tagNo++).padStart(4, "0")}`;
  }

  readUntilTaggedOrGreeting() {
    return this.readUntil(line => /^\* (OK|PREAUTH|BYE)/i.test(line));
  }

  readContinuation() {
    return this.readUntil(line => /^\+/.test(line));
  }

  readUntilTag(tag) {
    return this.readUntil(line => new RegExp(`^${tag} `).test(line));
  }

  readUntil(predicate) {
    return new Promise((resolve, reject) => {
      let text = "";
      let pendingLiteralBytes = 0;
      const onData = chunk => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (true) {
          if (pendingLiteralBytes) {
            if (this.buffer.length < pendingLiteralBytes + 2) return;
            text += this.buffer.subarray(0, pendingLiteralBytes).toString("utf8");
            this.buffer = this.buffer.subarray(pendingLiteralBytes + 2);
            text += "\r\n";
            pendingLiteralBytes = 0;
            continue;
          }
          const lineEnd = this.buffer.indexOf("\r\n");
          if (lineEnd < 0) return;
          const lineBuf = this.buffer.subarray(0, lineEnd);
          const line = lineBuf.toString("utf8");
          this.buffer = this.buffer.subarray(lineEnd + 2);
          text += `${line}\r\n`;
          const literal = line.match(/\{(\d+)\}$/);
          if (literal) {
            pendingLiteralBytes = Number(literal[1]);
            continue;
          }
          if (predicate(line)) {
            cleanup();
            resolve(text);
            return;
          }
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

function quote(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function unquote(value) {
  const text = String(value || "");
  return text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1).replace(/\\"/g, '"') : text;
}

function compact(text) {
  return String(text || "").replace(/\s+/g, " ").slice(0, 500);
}

function decodeMailboxName(name) {
  return String(name || "");
}

function parseHeaderBlock(block) {
  const unfolded = String(block || "").replace(/\r?\n[ \t]+/g, " ");
  const headers = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index > 0) headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

function parseFetchHeaders(text, uid) {
  const sizeMatch = text.match(/RFC822\.SIZE\s+(\d+)/i);
  const flagsMatch = text.match(/FLAGS\s+\(([^)]*)\)/i);
  const headerMatch = text.match(/BODY\[HEADER\.FIELDS[^\]]*\]\s+\{\d+\}\r\n([\s\S]*?)\r\n\)/i);
  const headers = parseHeaderBlock(headerMatch ? headerMatch[1] : text);
  return {
    uid,
    subject: headers.subject || "",
    from: headers.from || "",
    to: headers.to || "",
    cc: headers.cc || "",
    date: headers.date || "",
    message_id: headers["message-id"] || "",
    in_reply_to: headers["in-reply-to"] || "",
    references: headers.references || "",
    flags: flagsMatch ? flagsMatch[1].split(/\s+/).filter(Boolean) : [],
    size: sizeMatch ? Number(sizeMatch[1]) : undefined
  };
}

module.exports = { ImapClient, parseFetchHeaders, quote };
