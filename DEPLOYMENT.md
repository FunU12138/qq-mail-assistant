# Remote Deployment Plan

目标：部署为远程 HTTPS MCP 服务，让 ChatGPT 网页版直接连接，使用体验接近飞书助手。

## 必要条件

部署平台需要支持：

- HTTPS public URL
- Node.js 18+ 或 Docker
- 出站 TLS TCP 连接到 `imap.qq.com:993` 和 `smtp.qq.com:465`
- Secret / Environment Variables
- 私有文件或持久卷，用于保存不提交 GitHub 的简历 PDF

不建议第一阶段用纯静态托管或边缘 Worker，因为 IMAP/SMTP 需要原生 TCP/TLS 能力。

## Secrets

部署环境必须配置：

```text
QQ_MAIL_AUTH_CODE=<QQ邮箱授权码>
QQ_MAIL_MCP_BEARER_TOKEN=<给ChatGPT连接MCP用的长随机令牌>
QQ_MAIL_PUBLIC_MCP_URL=https://<your-domain>/mcp
QQ_MAIL_CONFIG=/app/config/production.json
QQ_MAIL_ASSISTANT_HOST=0.0.0.0
QQ_MAIL_ASSISTANT_PORT=3050
```

`QQ_MAIL_MCP_BEARER_TOKEN` 建议使用至少 32 字节随机值。

## Private Resume Files

远程服务器不能访问本机 `C:\Users\...` 路径。需要把两份简历作为私有文件上传到部署环境，例如：

```text
/app/private/resumes/data_ai.pdf
/app/private/resumes/business_product.pdf
```

不要把简历 PDF 提交到 GitHub。

## Production Config

复制：

```text
config/production.example.json -> config/production.json
```

根据部署平台的私有文件路径修改 `resumes.*.path`。

`config/production.json` 不应提交 GitHub。

## ChatGPT Web Connection

在 ChatGPT 网页版开发者模式中添加远程 MCP：

```text
URL: https://<your-domain>/mcp
Authorization: Bearer <QQ_MAIL_MCP_BEARER_TOKEN>
```

默认所有写操作应保持需要确认。第一阶段没有 `send_email` 工具，只有创建和修改草稿。

## Verification

部署后依次验证：

1. `GET https://<your-domain>/healthz` 返回 `live`
2. ChatGPT 网页版能添加 MCP server
3. ChatGPT 网页版能看到工具列表
4. 调用 `list_emails`
5. 调用 `create_draft`
6. 调用 `create_job_application_draft`
7. QQ 邮箱网页版草稿箱能看到真实草稿
8. 原始简历私有文件 hash 不变
