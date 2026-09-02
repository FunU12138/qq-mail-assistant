# ChatGPT 网页版接入说明

目标体验：在 ChatGPT 网页版聊天框里，像飞书助手一样调用 QQ 邮箱助手工具。这是本项目的硬性验收条件。

## 结论

ChatGPT 网页版不能直接访问你电脑上的 `http://127.0.0.1:3050/mcp`。需要二选一：

1. 本地服务 + HTTPS 隧道：适合第一阶段开发和个人使用。
2. 远程 HTTPS MCP 服务：最像飞书助手，不需要每次打开本地终端，但需要部署服务器并安全保存 QQ 邮箱授权码。

只做本地 Codex 插件、只让命令行跑起来、或只让 Codex 当前任务能调用，都不算最终完成。

## 飞书同款本地 Tunnel 方式

这和当前飞书助手的桌面启动方式一致：

1. 双击 `start-qq-mail-assistant.cmd`。
2. 第一个窗口启动本地 QQ Mail MCP：`http://127.0.0.1:3050/mcp`。
3. 第二个窗口启动 OpenAI Secure MCP Tunnel，profile 为 `qq-mail`。
4. 第一次启动时输入：
   - QQ 邮箱授权码
   - OpenAI Runtime API Key
   - QQ 邮箱助手专用 tunnel id，例如 `tunnel_xxx`
5. 两个窗口都保持打开。
6. 在 ChatGPT 网页版开发者模式/连接器里使用这个 tunnel 对应的 QQ 邮箱助手。

注意：tunnel id 需要在 OpenAI Tunnels 管理页创建，或由已有 ChatGPT 开发者模式连接器提供。飞书脚本里也有一个固定的 `tunnel_...`，QQ 邮箱助手不能复用飞书的 tunnel id，否则两个助手会互相抢同一个连接。

## 最终更理想方式

把 QQ 邮箱助手部署为远程 HTTPS MCP 服务。这样体验最接近飞书助手：

- ChatGPT 网页版直接连接远程 HTTPS MCP。
- 你不需要每次双击本地终端。
- 需要额外设计安全的授权码保存方式。
- 第一阶段仍然默认禁止发送邮件，只允许创建草稿。

远程部署细节见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 和飞书助手的区别

当前飞书助手配置里使用的是远程 MCP：

```text
https://mcp.feishu.cn/mcp
```

因此飞书不需要你每次本地启动服务。QQ 邮箱助手现在是本地独立项目，所以需要本地服务运行，除非以后把它部署成远程 MCP。

## 安全建议

- 不要把 QQ 邮箱授权码写进源码。
- 不要把授权码填入 `config/local.json`。
- 不要把授权码发到聊天里。
- 如果授权码已经出现在截图或聊天记录里，请在 QQ 邮箱里重新生成授权码。
