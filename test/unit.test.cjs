"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildMimeMessage, encodeHeader, sanitizeFileName } = require("../src/mime.cjs");
const { redact } = require("../src/logger.cjs");
const { MailAdapter, extractAttachments } = require("../src/mail-adapter.cjs");
const { semanticTools } = require("../src/tools.cjs");

assert.strictEqual(encodeHeader("中文标题").startsWith("=?UTF-8?B?"), true);
assert.strictEqual(sanitizeFileName('方乐:AI/产品?.pdf'), "方乐_AI_产品_.pdf");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qq-mail-assistant-"));
const pdf = path.join(tmp, "resume.pdf");
fs.writeFileSync(pdf, Buffer.from("%PDF-1.4\nunit\n"));
const mime = buildMimeMessage({
  from: "2381930907@qq.com",
  fromName: "方乐",
  to: "hr@example.com",
  subject: "方乐_北京交通大学_AI产品实习生",
  text: "您好，附件是我的简历。",
  attachments: [{ path: pdf, filename: "方乐_北京交通大学_AI产品实习生.pdf" }]
});
assert.match(mime, /Subject: =\?UTF-8\?B\?/);
assert.match(mime, /Content-Disposition: attachment;/);
assert.match(mime, /filename\*=UTF-8''/);
assert.match(mime, /Content-Transfer-Encoding: base64/);

const attachments = extractAttachments(mime);
assert.strictEqual(attachments.length, 1);
assert.strictEqual(attachments[0].filename, "方乐_北京交通大学_AI产品实习生.pdf");
assert.deepStrictEqual(attachments[0].content, fs.readFileSync(pdf));

const redacted = redact({ authCode: "dummy-auth-code", body: "very sensitive body", nested: { password: "secret" } });
assert.strictEqual(redacted.authCode, "[redacted]");
assert.match(redacted.body, /\[redacted text length=/);
assert.strictEqual(redacted.nested.password, "[redacted]");

const toolNames = semanticTools.map(tool => tool.name);
for (const name of ["list_emails", "create_draft", "update_draft", "create_job_application_draft"]) {
  assert(toolNames.includes(name), `missing tool ${name}`);
}

const config = {
  account: { email: "2381930907@qq.com", displayName: "方乐" },
  auth: { user: "2381930907@qq.com", authCode: "x" },
  imap: {},
  paths: { outgoingDir: tmp, runtimeDir: tmp },
  jobApplication: { candidateName: "方乐", school: "北京交通大学" },
  resumes: {
    data_ai: { path: pdf, tags: ["AI", "LLM", "data"] },
    business_product: { path: pdf, tags: ["strategy", "business"] }
  }
};
const adapter = new MailAdapter(config, { info() {}, warn() {}, error() {} });
assert.strictEqual(adapter.chooseResume("LLM 产品和 AI 数据分析", null).key, "data_ai");
assert.throws(
  () => adapter.chooseResume("古典文学编辑与校对岗位", null),
  /No configured resume matched/
);
const before = fs.readFileSync(pdf).toString("hex");
const copy = adapter.prepareOutgoingCopy(config.resumes.data_ai, "测试公司", "AI产品实习生");
assert(fs.existsSync(copy.path));
assert.strictEqual(fs.readFileSync(pdf).toString("hex"), before);
assert.match(copy.filename, /AI产品实习生\.pdf$/);

console.log("unit tests passed");
