"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function foldLine(line, limit = 76) {
  if (Buffer.byteLength(line, "utf8") <= limit) return line;
  const chunks = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > limit) {
    let slice = rest.slice(0, limit);
    while (Buffer.byteLength(slice, "utf8") > limit && slice.length > 1) slice = slice.slice(0, -1);
    chunks.push(slice);
    rest = rest.slice(slice.length);
  }
  if (rest) chunks.push(rest);
  return chunks.map((chunk, index) => (index ? ` ${chunk}` : chunk)).join("\r\n");
}

function encodeHeader(value) {
  const text = String(value || "");
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function encodeAddress(address, displayName) {
  const clean = String(address || "").trim();
  if (!displayName) return `<${clean}>`;
  return `${encodeHeader(displayName)} <${clean}>`;
}

function encodeFilenameParam(filename) {
  const utf8 = encodeURIComponent(filename).replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `filename="${encodeHeader(filename)}"; filename*=UTF-8''${utf8}`;
}

function base64Lines(buffer) {
  return buffer.toString("base64").replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function sanitizeFileName(name) {
  return String(name || "attachment")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function messageId(domain = "qq-mail-assistant.local") {
  return `<${Date.now()}.${crypto.randomBytes(8).toString("hex")}@${domain}>`;
}

function makeBoundary(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function textPart(contentType, body) {
  return [
    `Content-Type: ${contentType}; charset=utf-8`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(String(body || ""), "utf8"))
  ].join("\r\n");
}

function attachmentPart(filePath, filename) {
  const finalName = sanitizeFileName(filename || path.basename(filePath));
  const content = fs.readFileSync(filePath);
  const ext = path.extname(finalName).toLowerCase();
  const type = ext === ".pdf"
    ? "application/pdf"
    : ext === ".docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/octet-stream";
  const nameParam = encodeFilenameParam(finalName);
  return [
    `Content-Type: ${type}; name="${encodeHeader(finalName)}"; name*=UTF-8''${encodeURIComponent(finalName)}`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; ${nameParam}`,
    "",
    base64Lines(content)
  ].join("\r\n");
}

function buildMimeMessage(input) {
  const attachments = input.attachments || [];
  const fromDomain = String(input.from || "mail.local").split("@")[1] || "mail.local";
  const headers = [
    `From: ${encodeAddress(input.from, input.fromName)}`,
    `To: ${Array.isArray(input.to) ? input.to.join(", ") : input.to}`,
    input.cc ? `Cc: ${Array.isArray(input.cc) ? input.cc.join(", ") : input.cc}` : null,
    input.bcc ? `Bcc: ${Array.isArray(input.bcc) ? input.bcc.join(", ") : input.bcc}` : null,
    `Subject: ${foldLine(encodeHeader(input.subject || ""))}`,
    `Date: ${new Date(input.date || Date.now()).toUTCString()}`,
    `Message-ID: ${input.messageId || messageId(fromDomain)}`,
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
    input.references ? `References: ${Array.isArray(input.references) ? input.references.join(" ") : input.references}` : null,
    "MIME-Version: 1.0"
  ].filter(Boolean);

  let bodyPart;
  if (input.html && input.text) {
    const alt = makeBoundary("alt");
    bodyPart = [
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      `--${alt}`,
      textPart("text/plain", input.text),
      `--${alt}`,
      textPart("text/html", input.html),
      `--${alt}--`
    ].join("\r\n");
  } else if (input.html) {
    bodyPart = textPart("text/html", input.html);
  } else {
    bodyPart = textPart("text/plain", input.text || "");
  }

  if (!attachments.length) return `${headers.join("\r\n")}\r\n${bodyPart}\r\n`;

  const mixed = makeBoundary("mixed");
  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    bodyPart,
    ...attachments.flatMap(item => [`--${mixed}`, attachmentPart(item.path, item.filename)]),
    `--${mixed}--`,
    ""
  ];
  return parts.join("\r\n");
}

module.exports = {
  attachmentPart,
  base64Lines,
  buildMimeMessage,
  encodeHeader,
  messageId,
  sanitizeFileName
};
