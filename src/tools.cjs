"use strict";

const { MailAdapter } = require("./mail-adapter.cjs");

const emailSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mailbox: { type: "string" },
    limit: { type: "number", minimum: 1, maximum: 50 }
  }
};

const draftProps = {
  to: { type: "string", description: "Recipient email address or RFC 5322 recipient list." },
  cc: { type: "string" },
  bcc: { type: "string" },
  subject: { type: "string" },
  text: { type: "string" },
  html: { type: "string" },
  attachments: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string" },
        filename: { type: "string" }
      },
      required: ["path"]
    }
  },
  mailbox: { type: "string" }
};

const semanticTools = [
  { name: "list_emails", description: "List recent emails from a mailbox using QQ Mail IMAP.", inputSchema: emailSchema },
  { name: "search_emails", description: "Search QQ Mail messages by IMAP TEXT query.", inputSchema: { ...emailSchema, properties: { ...emailSchema.properties, query: { type: "string" } } } },
  { name: "read_email", description: "Read a raw email by IMAP UID.", inputSchema: { type: "object", additionalProperties: false, properties: { mailbox: { type: "string" }, uid: { type: "number" } }, required: ["uid"] } },
  { name: "create_draft", description: "Create a real QQ Mail draft by appending a complete MIME message to the Drafts mailbox. Does not send email.", inputSchema: { type: "object", additionalProperties: false, properties: draftProps, required: ["to", "subject"] } },
  { name: "update_draft", description: "Replace an existing draft by creating a new draft and deleting the old draft UID.", inputSchema: { type: "object", additionalProperties: false, properties: { ...draftProps, uid: { type: "number" }, delete_original: { type: "boolean" } }, required: ["uid", "to", "subject"] } },
  { name: "reply_draft", description: "Create a reply draft preserving Message-ID threading headers from the original email.", inputSchema: { type: "object", additionalProperties: false, properties: { ...draftProps, original_mailbox: { type: "string" }, original_uid: { type: "number" } }, required: ["original_uid", "to"] } },
  { name: "download_attachment", description: "Download an attachment from a message. Phase 1 placeholder until full MIME part extraction is enabled.", inputSchema: { type: "object", additionalProperties: false, properties: { mailbox: { type: "string" }, uid: { type: "number" }, attachment_name: { type: "string" }, output_dir: { type: "string" } }, required: ["uid"] } },
  { name: "mark_as_read", description: "Mark a QQ Mail message as read by IMAP UID.", inputSchema: { type: "object", additionalProperties: false, properties: { mailbox: { type: "string" }, uid: { type: "number" } }, required: ["uid"] } },
  { name: "archive_email", description: "Move a QQ Mail message to an archive mailbox by copy plus delete.", inputSchema: { type: "object", additionalProperties: false, properties: { mailbox: { type: "string" }, uid: { type: "number" }, archive_mailbox: { type: "string" } }, required: ["uid"] } },
  {
    name: "create_job_application_draft",
    description: "Choose a configured resume from a JD, copy and rename the PDF attachment, generate or accept subject/body, and create a real QQ Mail draft. Does not send email.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        to: { type: "string" },
        company: { type: "string" },
        position: { type: "string" },
        jd: { type: "string" },
        job_description: { type: "string" },
        resume_key: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        text: { type: "string" },
        html: { type: "string" }
      },
      required: ["to", "position"]
    }
  }
];

function createHandlers(config, logger) {
  const adapter = new MailAdapter(config, logger);
  return {
    list_emails: args => adapter.listEmails(args),
    search_emails: args => adapter.searchEmails(args),
    read_email: args => adapter.readEmail(args),
    create_draft: args => adapter.createDraft(args),
    update_draft: args => adapter.updateDraft(args),
    reply_draft: args => adapter.replyDraft(args),
    download_attachment: args => adapter.downloadAttachment(args),
    mark_as_read: args => adapter.markAsRead(args),
    archive_email: args => adapter.archiveEmail(args),
    create_job_application_draft: args => adapter.createJobApplicationDraft(args)
  };
}

module.exports = { createHandlers, semanticTools };
