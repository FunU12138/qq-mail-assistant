# QQ 邮箱助手

独立 MCP 邮件助手，通过 QQ 邮箱官方 IMAP/SMTP 能力工作。第一阶段默认只创建和修改草稿，不自动发送邮件。

硬性目标：最终必须能在 ChatGPT 网页版聊天框里像飞书助手插件一样使用。只在本地命令行或 Codex 里运行不算最终完成。

## 架构

ChatGPT -> 少量语义邮件工具 -> Mail Adapter -> IMAP/SMTP -> QQ 邮箱。

本项目参考现有飞书助手的稳定做法：本地 HTTP MCP 服务暴露 `/mcp`，`tools/list` 返回少量语义工具，`tools/call` 由内部 adapter 处理。飞书助手项目不会被修改，也不是运行时依赖。

## 配置

1. 复制 `config/example.json` 为 `config/local.json`。
2. 普通邮箱能力无需配置简历。
3. 求职投递辅助模块默认读取 `resume_library/` 和 `application_rules/`。
4. 设置环境变量：

```powershell
$env:QQ_MAIL_AUTH_CODE = "你的 QQ 邮箱授权码"
```

可选环境变量：

```powershell
$env:QQ_MAIL_CONFIG = "C:/path/to/local.json"
$env:QQ_MAIL_ASSISTANT_HOST = "127.0.0.1"
$env:QQ_MAIL_ASSISTANT_PORT = "3050"
```

授权码、密码和本地配置已被 `.gitignore` 排除。不要提交 `config/local.json` 或 `.env`。

## 启动

```powershell
npm start
```

MCP 地址：

```text
http://127.0.0.1:3050/mcp
```

也可以双击：

```text
start-qq-mail-assistant.cmd
```

如果启动失败，窗口会停住并显示原因。

如果想放到桌面，请不要复制 `start-qq-mail-assistant.cmd` 本体。请双击：

```text
create-desktop-shortcut.cmd
```

它会在桌面创建一个真正的快捷方式，快捷方式目标仍指向本项目里的启动入口。

读取邮件诊断：

```text
debug-read-mail.cmd
```

它会调用 `list_emails` 和 `search_emails`，用于排查 ChatGPT 侧 502 背后的真实本地错误。

## ChatGPT 网页版

请看 [CHATGPT_WEB_SETUP.md](CHATGPT_WEB_SETUP.md)。网页版不能直接访问 `127.0.0.1`，需要 HTTPS MCP 地址；本地开发阶段建议用 Secure MCP Tunnel，稳定后再部署成远程 MCP 服务。

## 工具

- `list_emails`
- `search_emails`
- `read_email`
- `create_draft`
- `update_draft`
- `reply_draft`
- `download_attachment`
- `mark_as_read`
- `archive_email`
- `validate_application`
- `create_job_application_draft`

普通邮件工具保持通用邮箱助手能力。求职投递只是可选模块，入口是 `validate_application` 和 `create_job_application_draft`。

## 求职投递辅助模块

简历库：

```text
resume_library/
  data_ai.pdf
  english_resume.pdf
  industry_research.pdf
```

规则库：

```text
application_rules/
  resume_selection.yaml
  file_name.yaml
```

`create_job_application_draft` 会让 ChatGPT 根据 JD 判断使用哪份 PDF。默认可省略 `resume_key`，效果等同 `resume_key=auto`；也可以传具体简历键，例如 `data_ai`、`english_resume` 或 `industry_research`。自动模式会读取 JD，匹配 `application_rules/resume_selection.yaml`，返回选中简历和原因，然后复制简历库 PDF 到 `outgoing/`，按 JD 要求或默认规则重命名附件，创建完整 MIME 邮件，并通过 IMAP `APPEND` 保存到 QQ 邮箱草稿箱。
