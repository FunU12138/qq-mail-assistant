"use strict";

const fs = require("fs");
const path = require("path");
const { sanitizeFileName } = require("../../src/mime.cjs");

function readTextIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function parseResumeSelectionYaml(text) {
  const rules = [];
  let current = null;
  let inKeywords = false;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    const ruleMatch = line.match(/^  (\S[^:]*):\s*$/);
    if (ruleMatch) {
      current = { name: ruleMatch[1].trim(), resume: "", keywords: [] };
      rules.push(current);
      inKeywords = false;
      continue;
    }
    if (!current) continue;
    const resumeMatch = line.match(/^    resume:\s*(.+?)\s*$/);
    if (resumeMatch) {
      current.resume = resumeMatch[1].trim();
      inKeywords = false;
      continue;
    }
    if (/^    keywords:\s*$/.test(line)) {
      inKeywords = true;
      continue;
    }
    const keywordMatch = line.match(/^      -\s*(.+?)\s*$/);
    if (inKeywords && keywordMatch) current.keywords.push(keywordMatch[1].trim());
  }
  return rules.filter(rule => rule.resume && rule.keywords.length);
}

function loadResumeRules(projectRoot) {
  const file = path.join(projectRoot, "application_rules", "resume_selection.yaml");
  return parseResumeSelectionYaml(readTextIfExists(file));
}

function loadFileNameRules(projectRoot) {
  const file = path.join(projectRoot, "application_rules", "file_name.yaml");
  const text = readTextIfExists(file);
  const strictWhenMentions = [];
  let inStrictList = false;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (/^  strict_when_mentions:\s*$/.test(line)) {
      inStrictList = true;
      continue;
    }
    const itemMatch = line.match(/^    -\s*(.+?)\s*$/);
    if (inStrictList && itemMatch) {
      strictWhenMentions.push(itemMatch[1].trim());
      continue;
    }
    if (inStrictList && line && !/^    /.test(line)) inStrictList = false;
  }
  return { strictWhenMentions };
}

function configuredResume(config, key) {
  const resume = config.resumes?.[key];
  if (!resume) throw new Error(`Resume key is not configured: ${key}`);
  return { key, ...resume };
}

function keywordHits(text, keywords) {
  const normalized = String(text || "").toLowerCase();
  return keywords.filter(keyword => normalized.includes(String(keyword).toLowerCase()));
}

function selectResume({ config, projectRoot, jd, resumeKey }) {
  const normalizedResumeKey = resumeKey || "auto";
  if (normalizedResumeKey && normalizedResumeKey !== "auto") {
    return {
      resume: configuredResume(config, normalizedResumeKey),
      reason: `Manual resume_key selected: ${normalizedResumeKey}`,
      matched_rule: null,
      matched_keywords: []
    };
  }

  const rules = loadResumeRules(projectRoot);
  let best = null;
  for (const rule of rules) {
    const hits = keywordHits(jd, rule.keywords);
    if (hits.length > 0 && (!best || hits.length > best.hits.length)) best = { rule, hits };
  }
  if (!best) {
    throw new Error("No application rule matched the job description. Ask ChatGPT to choose a resume_key explicitly or update application_rules/resume_selection.yaml.");
  }
  return {
    resume: configuredResume(config, best.rule.resume),
    reason: `岗位包含 ${best.hits.join("、")} 关键词，匹配规则「${best.rule.name}」。`,
    matched_rule: best.rule.name,
    matched_keywords: best.hits
  };
}

function getJobInfo(config) {
  return {
    name: config.jobApplication?.candidateName || "候选人",
    school: config.jobApplication?.school || "学校",
    major: config.jobApplication?.major || "专业",
    graduationTime: config.jobApplication?.graduationTime || "毕业时间"
  };
}

function detectRequiredAttachmentFormat(jd, fileNameRules = {}) {
  const text = String(jd || "");
  for (const marker of fileNameRules.strictWhenMentions || []) {
    if (text.includes(marker)) return "name-school-major-graduation";
  }
  if (/姓名[-_－—]学校[-_－—]专业[-_－—]毕业时间/.test(text)) return "name-school-major-graduation";
  return "default";
}

function buildAttachmentFileName({ config, projectRoot, jd, position }) {
  const info = getJobInfo(config);
  const fileNameRules = projectRoot ? loadFileNameRules(projectRoot) : {};
  if (detectRequiredAttachmentFormat(jd, fileNameRules) === "name-school-major-graduation") {
    return sanitizeFileName(`${info.name}-${info.school}-${info.major}-${info.graduationTime}.pdf`);
  }
  return sanitizeFileName(`${info.name}_${info.school}_${position || "求职"}.pdf`);
}

function validateApplication({ selectedResume, subject, attachmentFilename, attachments, jd, position }) {
  const checks = [];
  checks.push({ name: "Resume selected", success: Boolean(selectedResume?.key) });
  checks.push({ name: "Subject format matched", success: Boolean(subject && String(subject).includes(position || "")) });
  checks.push({ name: "Attachment added", success: Array.isArray(attachments) && attachments.length > 0 });
  checks.push({ name: "Attachment filename matched", success: Boolean(attachmentFilename && attachmentFilename.endsWith(".pdf")) });
  checks.push({ name: "Required information present", success: Boolean(jd && position) });
  const ready = checks.every(check => check.success);
  return {
    title: "Application Check",
    checks,
    ready,
    summary: [
      "Application Check:",
      "",
      ...checks.map(check => `${check.success ? "✓" : "✗"} ${check.name}`),
      "",
      ready ? "Ready for draft" : "Not ready for draft"
    ].join("\n")
  };
}

module.exports = {
  buildAttachmentFileName,
  detectRequiredAttachmentFormat,
  loadFileNameRules,
  loadResumeRules,
  selectResume,
  validateApplication
};
