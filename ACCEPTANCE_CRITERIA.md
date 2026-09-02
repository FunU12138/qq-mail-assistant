# Acceptance Criteria

## Non-negotiable Requirement

QQ 邮箱助手必须能在 ChatGPT 网页版聊天框中像飞书助手插件一样使用。

仅满足以下任一情况都不能算最终完成：

- 只能在 Codex 本地任务里调用。
- 只能在命令行里运行。
- 只能访问 `http://127.0.0.1:3050/mcp`。
- 只创建了本地 Codex 插件 manifest。

## Final ChatGPT Web Requirement

ChatGPT 网页版需要连接一个可访问的 HTTPS MCP 地址。实现方式可以是：

1. 本地 QQ 邮箱助手服务 + HTTPS tunnel。
2. 远程部署的 QQ 邮箱助手 HTTPS MCP 服务。

最终验收必须包括：

- ChatGPT 网页版开发者模式/连接器中能添加 QQ 邮箱助手。
- ChatGPT 网页版能列出 QQ 邮箱助手工具。
- ChatGPT 网页版能调用 `create_job_application_draft`。
- 草稿真实出现在 QQ 邮箱草稿箱。
- 默认没有 `send_email` 工具，不会自动发送邮件。

## Security Requirement

- QQ 邮箱授权码不得硬编码进源码。
- QQ 邮箱授权码不得提交到 GitHub。
- 日志不得输出授权码、密码、完整敏感邮件正文或身份证等敏感信息。
