"use strict";

const fs = require("fs");
const path = require("path");
const { ImapClient } = require("./imap-client.cjs");
const { buildMimeMessage, messageId, sanitizeFileName } = require("./mime.cjs");
const { requireAuth } = require("./config.cjs");

class MailAdapter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async withImap(callback, readOnly = false, mailbox) {
    requireAuth(this.config);
    const client = new ImapClient(this.config.imap);
    await client.connect();
    try {
      await client.login(this.config.auth.user, this.config.auth.authCode);
      if (mailbox) await client.select(mailbox, readOnly);
      return await callback(client);
    } finally {
      client.close();
    }
  }

  async listMailboxes() {
    return this.withImap(client => client.listMailboxes());
  }

  async resolveDraftsMailbox() {
    if (this.config.imap?.draftsMailbox) return this.config.imap.draftsMailbox;
    const boxes = await this.listMailboxes();
    const candidates = ["Drafts", "草稿箱", "草稿", "Draft"];
    const found = boxes.find(box =>
      box.flags.some(flag => /Drafts/i.test(flag)) ||
      candidates.some(name => box.name.toLowerCase() === name.toLowerCase())
    );
    if (!found) {
      throw new Error(`Could not find QQ Mail Drafts mailbox. Available: ${boxes.map(b => b.name).join(", ")}`);
    }
    return found.name;
  }

  async listEmails({ mailbox = "INBOX", limit = 10 } = {}) {
    return this.withImap(async client => {
      const count = client.exists || 0;
      const max = Math.max(1, Math.min(Number(limit || 10), 50));
      const selected = [];
      for (let seq = count; seq >= 1 && selected.length < max; seq--) selected.push(seq);
      const emails = [];
      for (const seq of selected) emails.push(await client.fetchHeadersBySequence(seq));
      return { mailbox, total_messages: count, emails };
    }, true, mailbox);
  }

  async searchEmails({ mailbox = "INBOX", query = "", limit = 10, scan_limit = 50, full_text = false } = {}) {
    if (!query) return this.listEmails({ mailbox, limit });
    if (!full_text) {
      const recent = await this.listEmails({ mailbox, limit: Math.max(Number(limit || 10), Math.min(Number(scan_limit || 50), 200)) });
      const needle = String(query || "").toLowerCase();
      const emails = recent.emails
        .filter(email => [email.subject, email.from, email.to, email.cc, email.date].some(value => String(value || "").toLowerCase().includes(needle)))
        .slice(0, Number(limit || 10));
      return { mailbox, query, searched_recent_messages: recent.emails.length, emails };
    }
    const criteria = query ? `${/[^\x00-\x7f]/.test(query) ? "CHARSET UTF-8 " : ""}TEXT ${imapString(query)}` : "ALL";
    return this.withImap(async client => {
      const uids = await client.search(criteria);
      const selected = uids.slice(-Number(limit || 10)).reverse();
      const emails = [];
      for (const uid of selected) emails.push(await client.fetchHeaders(uid));
      return { mailbox, query, emails };
    }, true, mailbox);
  }

  async readEmail({ mailbox = "INBOX", uid }) {
    if (!uid) throw new Error("uid is required.");
    return this.withImap(async client => {
      const raw = await client.fetchRaw(Number(uid));
      return { mailbox, uid: Number(uid), raw };
    }, true, mailbox);
  }

  async createDraft(input) {
    const mailbox = input.mailbox || await this.resolveDraftsMailbox();
    const mime = buildMimeMessage({
      from: this.config.account.email,
      fromName: this.config.account.displayName,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments || [],
      messageId: input.messageId || messageId(this.config.account.email.split("@")[1]),
      inReplyTo: input.inReplyTo,
      references: input.references
    });
    this.logger.info("create_draft", {
      mailbox,
      to: input.to,
      cc: input.cc,
      has_html: Boolean(input.html),
      attachment_count: (input.attachments || []).length
    });
    return this.withImap(async client => {
      const appended = await client.append(mailbox, mime, ["\\Draft"]);
      return {
        success: true,
        mailbox,
        uid: appended.uid,
        subject: input.subject,
        to: input.to,
        attachment_names: (input.attachments || []).map(item => item.filename || path.basename(item.path))
      };
    });
  }

  async updateDraft(input) {
    if (!input.uid) throw new Error("uid is required for update_draft.");
    const mailbox = input.mailbox || await this.resolveDraftsMailbox();
    const created = await this.createDraft({ ...input, mailbox });
    if (input.delete_original !== false) {
      await this.withImap(async client => {
        await client.store(Number(input.uid), "+FLAGS.SILENT (\\Deleted)");
        await client.expunge();
      }, false, mailbox);
    }
    return { ...created, replaced_uid: Number(input.uid) };
  }

  async replyDraft(input) {
    if (!input.original_uid) throw new Error("original_uid is required.");
    const original = await this.withImap(client => client.fetchHeaders(Number(input.original_uid)), true, input.original_mailbox || "INBOX");
    const refs = [original.references, original.message_id].filter(Boolean).join(" ");
    return this.createDraft({
      ...input,
      subject: input.subject || `Re: ${original.subject.replace(/^Re:\s*/i, "")}`,
      inReplyTo: original.message_id,
      references: refs
    });
  }

  async downloadAttachment({ mailbox = "INBOX", uid, attachment_name, output_dir }) {
    if (!uid) throw new Error("uid is required.");
    const raw = await this.withImap(client => client.fetchRaw(Number(uid)), true, mailbox);
    const attachments = extractAttachments(raw);
    const picked = attachment_name
      ? attachments.find(item => item.filename === attachment_name || item.filename.includes(attachment_name))
      : attachments[0];
    if (!picked) throw new Error("No matching attachment found.");
    const dir = output_dir ? path.resolve(output_dir) : path.join(this.config.paths.runtimeDir, "attachments");
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, sanitizeFileName(picked.filename));
    fs.writeFileSync(target, picked.content);
    return { success: true, mailbox, uid: Number(uid), filename: picked.filename, path: target, bytes: picked.content.length };
  }

  async markAsRead({ mailbox = "INBOX", uid }) {
    return this.withImap(async client => {
      await client.store(Number(uid), "+FLAGS.SILENT (\\Seen)");
      return { success: true, mailbox, uid: Number(uid), marked_as_read: true };
    }, false, mailbox);
  }

  async archiveEmail({ mailbox = "INBOX", uid, archive_mailbox = "已删除" }) {
    return this.withImap(async client => {
      await client.copy(Number(uid), archive_mailbox);
      await client.store(Number(uid), "+FLAGS.SILENT (\\Deleted)");
      await client.expunge();
      return { success: true, mailbox, uid: Number(uid), archived_to: archive_mailbox };
    }, false, mailbox);
  }

  chooseResume(jd, preferredKey) {
    const resumes = this.config.resumes || {};
    if (preferredKey && resumes[preferredKey]) return { key: preferredKey, ...resumes[preferredKey] };
    const text = String(jd || "").toLowerCase();
    let best = null;
    for (const [key, resume] of Object.entries(resumes)) {
      const tags = resume.tags || [];
      const score = tags.reduce((sum, tag) => sum + (text.includes(String(tag).toLowerCase()) ? 1 : 0), 0);
      if (!best || score > best.score) best = { key, score, ...resume };
    }
    if (!best) throw new Error("No resumes configured.");
    return best;
  }

  prepareOutgoingCopy(resume, company, position) {
    const source = path.resolve(resume.path);
    if (!fs.existsSync(source)) throw new Error(`Resume not found: ${source}`);
    fs.mkdirSync(this.config.paths.outgoingDir, { recursive: true });
    const base = sanitizeFileName(`${this.config.jobApplication?.candidateName || "候选人"}_${this.config.jobApplication?.school || "学校"}_${position || "求职"}.pdf`);
    const prefix = company ? `${sanitizeFileName(company)}_` : "";
    const filename = sanitizeFileName(`${prefix}${base}`);
    const target = path.join(this.config.paths.outgoingDir, `${Date.now()}_${filename}`);
    fs.copyFileSync(source, target);
    return { source, path: target, filename };
  }

  generateJobApplicationText({ company, position, jd }) {
    const subject = `${position || "岗位"}应聘-方乐-北京交通大学`;
    const intro = company ? `${company}招聘团队您好：` : "您好：";
    const body = [
      intro,
      "",
      `我想应聘${company ? company : "贵司"}${position ? `的${position}` : "相关岗位"}。结合岗位描述，我对数据分析、AI 产品、业务理解与跨团队沟通等要求进行了匹配，并附上更贴合岗位方向的简历供您参考。`,
      "",
      "我希望有机会进一步沟通岗位需求，并说明自己能够为团队带来的价值。",
      "",
      "谢谢您查看我的申请。",
      "",
      "方乐"
    ].join("\n");
    return { subject, body, jd_summary: String(jd || "").slice(0, 300) };
  }

  async createJobApplicationDraft(input) {
    const resume = this.chooseResume(input.jd || input.job_description, input.resume_key);
    const copy = this.prepareOutgoingCopy(resume, input.company, input.position);
    const generated = this.generateJobApplicationText({
      company: input.company,
      position: input.position,
      jd: input.jd || input.job_description
    });
    const result = await this.createDraft({
      to: input.to,
      subject: input.subject || generated.subject,
      text: input.text || input.body || generated.body,
      html: input.html,
      attachments: [{ path: copy.path, filename: copy.filename }]
    });
    return {
      ...result,
      selected_resume_key: resume.key,
      original_resume: copy.source,
      outgoing_attachment: copy.path,
      generated_subject: input.subject ? undefined : generated.subject,
      temporary_file_lifecycle: "kept in outgoing/ for audit and safe manual cleanup after draft verification"
    };
  }
}

function imapString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function decodeMimeWord(value) {
  return String(value || "").replace(/=\?utf-8\?b\?([^?]+)\?=/gi, (_, text) => Buffer.from(text, "base64").toString("utf8"));
}

function decodeHeaderParam(value) {
  const star = String(value || "").match(/filename\*=UTF-8''([^;\r\n]+)/i);
  if (star) return decodeURIComponent(star[1]);
  const normal = String(value || "").match(/filename="?([^";\r\n]+)"?/i) || String(value || "").match(/name="?([^";\r\n]+)"?/i);
  return normal ? decodeMimeWord(normal[1]) : "attachment";
}

function extractAttachments(raw) {
  const boundaryMatch = raw.match(/boundary="?([^";\r\n]+)"?/i);
  if (!boundaryMatch) return [];
  const boundary = boundaryMatch[1];
  const parts = raw.split(`--${boundary}`);
  const out = [];
  for (const part of parts) {
    if (!/Content-Disposition:\s*attachment/i.test(part)) continue;
    const split = part.search(/\r?\n\r?\n/);
    if (split < 0) continue;
    const header = part.slice(0, split);
    const body = part.slice(split).replace(/^\r?\n\r?\n?/, "").replace(/\r?\n--$/, "").trim();
    const filename = sanitizeFileName(decodeHeaderParam(header));
    const isBase64 = /Content-Transfer-Encoding:\s*base64/i.test(header);
    out.push({ filename, content: isBase64 ? Buffer.from(body.replace(/\s+/g, ""), "base64") : Buffer.from(body, "utf8") });
  }
  return out;
}

module.exports = { MailAdapter, extractAttachments };
