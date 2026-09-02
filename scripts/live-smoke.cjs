"use strict";

const fs = require("fs");
const crypto = require("crypto");
const { loadConfig } = require("../src/config.cjs");
const { createLogger } = require("../src/logger.cjs");
const { MailAdapter } = require("../src/mail-adapter.cjs");

async function main() {
  const config = loadConfig();
  const logger = createLogger(`${config.paths.runtimeDir}/live-smoke.ndjson`);
  const adapter = new MailAdapter(config, logger);
  const report = { started_at: new Date().toISOString(), checks: [] };

  const add = async (name, fn) => {
    try {
      const data = await fn();
      report.checks.push({ name, success: true, data });
      console.log(`PASS ${name}`);
    } catch (error) {
      report.checks.push({ name, success: false, error: error.message });
      console.log(`FAIL ${name}: ${error.message}`);
    }
  };

  await add("resolve_drafts_mailbox", async () => ({ mailbox: await adapter.resolveDraftsMailbox() }));
  await add("list_recent_emails", async () => adapter.listEmails({ limit: 3 }));
  await add("search_emails", async () => adapter.searchEmails({ query: "a", limit: 3 }));
  await add("create_plain_draft", async () => adapter.createDraft({
    to: config.account.email,
    subject: `QQ Mail Assistant smoke ${Date.now()}`,
    text: "Plain text draft created by QQ Mail Assistant smoke test. Do not send."
  }));
  await add("create_chinese_subject_draft", async () => adapter.createDraft({
    to: config.account.email,
    subject: `中文标题测试-${Date.now()}`,
    text: "这是一封中文标题草稿测试邮件，请勿发送。"
  }));

  const samplePdf = Object.values(config.resumes || {})[0]?.path;
  if (samplePdf && fs.existsSync(samplePdf)) {
    const before = crypto.createHash("sha256").update(fs.readFileSync(samplePdf)).digest("hex");
    await add("create_pdf_attachment_draft", async () => adapter.createDraft({
      to: config.account.email,
      subject: `PDF attachment smoke ${Date.now()}`,
      text: "Draft with PDF attachment. Do not send.",
      attachments: [{ path: samplePdf, filename: "测试附件_方乐.pdf" }]
    }));
    await add("create_job_application_draft", async () => adapter.createJobApplicationDraft({
      to: config.account.email,
      company: "测试公司",
      position: "AI产品实习生",
      jd: "负责 AI 产品需求分析、LLM 应用设计、数据分析和跨团队协作。"
    }));
    const after = crypto.createHash("sha256").update(fs.readFileSync(samplePdf)).digest("hex");
    report.checks.push({ name: "original_resume_unchanged", success: before === after, data: { path: samplePdf, sha256: before } });
    console.log(`${before === after ? "PASS" : "FAIL"} original_resume_unchanged`);
  } else {
    console.log("SKIP attachment/job draft checks: no configured resume PDF found.");
  }

  fs.mkdirSync(config.paths.runtimeDir, { recursive: true });
  fs.writeFileSync(`${config.paths.runtimeDir}/live-smoke-report.json`, JSON.stringify(report, null, 2), "utf8");
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
