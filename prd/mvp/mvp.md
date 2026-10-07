# KunCode Setup MVP PRD

## 1. 产品定位

**产品名称：KunCode Setup**

一款面向小白用户的 AI Coding Agent 配置助手，专门服务于 KunCode / NewAPI 用户。

目标：

> 用户不需要理解 API Key、Base URL、Provider、环境变量、配置文件等概念，只需要登录 KunCode、选择 AI Coding 工具和模型，即可自动完成本机配置并验证连接。

MVP 支持：

- Codex
- Claude Code
- OpenCode

平台第一阶段：

- **Windows 优先**

技术栈：

- Tauri 2
- React
- TypeScript
- shadcn/ui
- Tailwind CSS
- Rust
- Vite

---

# 2. MVP 核心用户流程

完整流程必须做到：

```text
启动 KunCode Setup
        ↓
检测本机环境
        ↓
选择 Coding Agent
        ↓
登录 KunCode
        ↓
获取账户 / 模型信息
        ↓
选择模型
        ↓
展示即将修改的配置
        ↓
自动备份原配置
        ↓
写入配置
        ↓
测试 API
        ↓
配置成功
        ↓
启动 Coding Agent
```

用户最终应该只需要点击几次按钮。

---

# 3. 首页

首页负责让用户快速理解产品。

展示：

### Hero

```text
KunCode Setup

AI Coding Agent 配置助手

专为 KunCode 用户打造
轻松配置 Codex、Claude Code、OpenCode
```

### 工具卡片

```text
Codex
OpenAI 官方 AI 编程助手

[开始配置]
```

```text
Claude Code
Anthropic 官方 AI 编程工具

[开始配置]
```

```text
OpenCode
开源 AI Coding Agent

[开始配置]
```

### 环境状态

显示：

```text
操作系统     Windows 11       ✓
Node.js      22.x             ✓
Git          2.x              ✓
Codex        已安装           ✓
Claude Code  未安装           -
OpenCode     已安装           ✓
```

首页不应该要求用户填写：

- Base URL
- API Key
- Provider
- 环境变量
- config.toml
- JSON 配置

这些全部由程序处理。

---

# 4. 环境检测

进入配置流程后，首先检测本机环境。

检测：

```text
OS
Architecture
Node.js
npm
Git
Codex
Claude Code
OpenCode
```

每个检测项具有：

```text
状态
版本
路径
```

例如：

```text
✓ Node.js
  v22.16.0
  C:\Program Files\nodejs\node.exe
```

如果没有安装：

```text
⚠ Node.js 未安装

Claude Code 需要 Node.js 才能运行。

[查看安装方式]
```

### MVP 注意

**不要在第一版自动安装 Node.js / Git。**

只检测和提示。

自动安装属于后续版本。

---

# 5. KunCode 登录

用户选择工具后进入 KunCode 登录。

MVP 支持：

```text
KunCode 账号
密码
```

以及预留：

```text
浏览器授权
```

推荐最终体验：

```text
登录 KunCode

账号
[________________]

密码
[________________]

[登录]

──────── 或 ────────

[使用浏览器授权]
```

登录成功后获取：

```text
用户信息
账户余额
可用模型
```

---

# 6. API Key 设计

**不要让用户手动创建 API Key。**

MVP 后端提供一个 Setup API。

客户端登录后：

```text
KunCode Setup
      ↓
认证 KunCode
      ↓
请求 Setup Token
      ↓
服务端创建 / 返回专用 API Key
      ↓
客户端安全保存
```

Setup API 不应该返回用户密码。

建议服务端设计：

```text
POST /api/setup/auth
POST /api/setup/token
GET  /api/setup/models
POST /api/setup/test
```

具体接口实现可以根据你的 NewAPI 实际 API 再确定。

---

# 7. 模型选择

模型列表从 KunCode 服务端获取。

不要在客户端硬编码模型。

展示：

```text
选择默认模型

⭐ GPT-5.6 Luna
日常 Coding / 性价比高

GPT-6 Astra
高难度 Coding

Claude xxx
复杂任务 / 长上下文
```

每个模型：

```text
模型名称
模型 ID
描述
是否推荐
```

可以显示价格，但 MVP **不要在客户端自己计算价格**。

价格应该由服务端提供。

---

# 8. Agent 配置抽象

三个 Agent 必须统一抽象。

前端不应该出现大量：

```text
if codex
if claude
if opencode
```

建议设计统一配置模型：

```ts
interface AgentConfig {
  agentId: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}
```

Rust 层实现：

```text
CodexProvider
ClaudeCodeProvider
OpenCodeProvider
```

统一接口：

```text
detect()
getConfig()
backup()
configure()
test()
launch()
```

未来可以继续增加：

```text
CursorProvider
GeminiCLIProvider
ClineProvider
RooProvider
```

---

# 9. Codex 配置

MVP 需要支持：

- 检测 Codex
- 读取现有配置
- 自动备份
- 写入 KunCode Provider
- 配置默认模型
- 配置 API Key
- 测试
- 启动 Codex

典型配置逻辑：

```text
~/.codex/
    config.toml
```

如果原文件存在：

```text
config.toml
```

先备份：

```text
config.toml.kuncode.bak
```

然后再修改。

**禁止直接覆盖用户原配置而不备份。**

---

# 10. Claude Code 配置

支持：

- 检测 Claude Code
- 配置 Base URL
- 配置 API Key / Auth Token
- 配置模型
- 备份已有配置
- 测试
- 启动

需要正确处理 Windows 环境变量。

不要要求用户自己执行：

```powershell
$env:ANTHROPIC_API_KEY=...
```

客户端负责配置。

---

# 11. OpenCode 配置

支持：

- 检测 OpenCode
- 查找配置文件
- 备份原配置
- 写入 KunCode Provider
- 设置默认模型
- 测试
- 启动

需要兼容：

```text
用户级配置
项目级配置
```

MVP 默认只操作**用户级配置**。

不要修改项目代码仓库中的配置。

---

# 12. 配置预览

真正修改之前必须给用户一个确认页面。

例如：

```text
准备配置 Codex

Provider
KunCode

Base URL
https://xxx/v1

Model
GPT-5.6 Luna

API Key
••••••••••••••••

配置文件
~/.codex/config.toml

✓ 原配置将自动备份

[返回]       [开始配置]
```

API Key 永远不能完整显示。

---

# 13. 配置过程

使用步骤进度：

```text
配置 Codex

✓ 检查 Codex
✓ 创建配置目录
✓ 备份原配置
✓ 写入 Provider
✓ 配置模型
✓ 保存 API Key
● 测试连接
○ 完成
```

失败时必须告诉用户**具体失败阶段**。

例如：

```text
配置失败

无法写入：

C:\Users\xxx\.codex\config.toml

原因：
文件被其他程序占用。

[重新尝试]
[恢复备份]
```

不能只显示：

```text
Error
```

---

# 14. API 测试

配置完成以后必须自动测试。

至少验证：

```text
✓ Base URL 可访问
✓ API Key 有效
✓ 模型存在
✓ API 请求成功
✓ Streaming 正常
```

最终：

```text
🎉 Codex 配置完成

KunCode API
✓ 正常

GPT-5.6 Luna
✓ 可用

响应时间
1.42s

[启动 Codex]
```

---

# 15. Dashboard

配置成功之后进入首页 Dashboard。

展示：

```text
我的 Coding Agents

┌─────────────────────────┐
│ Codex                   │
│ GPT-5.6 Luna            │
│ ● 已连接                │
│                         │
│ [启动] [重新配置]       │
└─────────────────────────┘

┌─────────────────────────┐
│ Claude Code             │
│ Claude xxx              │
│ ● 已连接                │
│                         │
│ [启动] [重新配置]       │
└─────────────────────────┘
```

账户区域：

```text
KunCode

余额 ¥18.32

[打开网站]
```

MVP 可以展示余额，但**不做复杂消费统计**。

---

# 16. 诊断功能

这是 MVP 必须做的一个功能。

入口：

```text
设置 → 系统诊断
```

一键检查：

```text
系统
✓ Windows 11

Node.js
✓ 22.16.0

Git
✓ 2.51.0

Codex
✓ 已安装

KunCode API
✓ 可访问

API Key
✓ 有效

模型
✓ GPT-5.6 Luna 可用
```

失败的时候给出解决建议。

例如：

```text
❌ KunCode API 请求失败

HTTP 401

API Key 无效或已失效。

[重新配置]
```

---

# 17. 配置备份与恢复

所有修改必须可回滚。

例如：

```text
原配置
    ↓
config.toml.kuncode.bak
    ↓
写入新配置
```

如果配置失败：

```text
恢复原配置
```

同时保存：

```text
backup timestamp
agent
original file path
```

---

# 18. 安全要求

这是 MVP 的硬要求。

### API Key

禁止：

```text
console.log(apiKey)
```

禁止写入：

```text
普通日志
错误日志
Telemetry
Crash Report
```

禁止发送到第三方。

### 日志

可以记录：

```text
配置 Codex
配置成功
测试失败
HTTP 401
```

不能记录：

```text
API Key
密码
完整 Authorization Header
Token
Cookie
```

### UI

Key 永远显示：

```text
sk-••••••••••••••••
```

---

# 19. Rust 与 React 职责

## React

负责：

```text
页面
UI
状态
用户交互
进度
错误展示
```

## Rust

负责：

```text
文件系统
环境变量
CLI 检测
CLI 启动
配置文件读写
备份
恢复
系统信息
安全存储
```

原则：

> **所有系统级操作必须经过 Rust，不允许 React 直接操作用户文件系统。**

---

# 20. UI 规范

整体风格：

### 白色 + 蓝色

不要做成：

```text
黑紫赛博朋克
```

而是：

```text
白色背景
浅灰卡片
蓝色主色
圆角
轻阴影
高信息密度但不拥挤
```

类似：

```text
Linear
Vercel
Raycast
现代 SaaS
```

### shadcn/ui

优先使用：

```text
Button
Card
Badge
Dialog
Alert
Progress
Tabs
DropdownMenu
Input
Select
Tooltip
Separator
Skeleton
Toast
```

不要自己重复造组件。

---

# 21. 页面结构

MVP 页面控制在：

```text
/
  首页

/setup/:agent
  Agent 配置流程

/models
  模型选择

/diagnose
  系统诊断

/settings
  设置
```

左侧导航：

```text
🏠 首页
🔧 工具配置
🩺 系统诊断
⚙ 设置
```

---

# 22. MVP 不做

明确禁止开发范围膨胀。

第一版不做：

```text
❌ MCP Marketplace
❌ Plugin Marketplace
❌ Cursor
❌ Cline
❌ Roo
❌ Gemini CLI
❌ Linux
❌ macOS
❌ 自动安装 Node.js
❌ 自动安装 Git
❌ AI 聊天
❌ Token 用量统计
❌ 复杂账单
❌ 多账户
❌ 团队管理
❌ 自动升级所有 CLI
❌ 云端保存 API Key
```

---

# 23. MVP 验收标准

最终必须满足：

### 新用户

一台干净 Windows 机器：

```text
安装 KunCode Setup
        ↓
打开
        ↓
选择 Codex
        ↓
登录 KunCode
        ↓
选择模型
        ↓
点击配置
        ↓
自动完成
        ↓
测试成功
        ↓
启动 Codex
```

用户**不需要打开 CMD / PowerShell 手动输入任何配置命令**。

---

### 已有用户

如果用户已经配置：

```text
~/.codex/config.toml
```

程序必须：

```text
检测
 ↓
备份
 ↓
修改
 ↓
验证
```

不能破坏原配置。

---

### 配置失败

必须：

```text
明确失败原因
+
保留原配置
+
允许恢复
+
允许重新配置
```

---

# 24. 推荐项目阶段

### Phase 1

```text
项目初始化
Tauri 2
React
TypeScript
shadcn/ui
Rust
```

### Phase 2

```text
环境检测
```

### Phase 3

```text
KunCode 登录
Setup API
模型列表
```

### Phase 4

```text
Codex Provider
```

### Phase 5

```text
Claude Code Provider
OpenCode Provider
```

### Phase 6

```text
API Test
Diagnosis
Backup / Restore
```

### Phase 7

```text
Windows 打包
Installer
版本信息
```

---

# 25. 最终 MVP 产品闭环

```text
                  KunCode Setup

                         │
                         ▼
                ┌─────────────────┐
                │  检测本机环境    │
                └────────┬────────┘
                         ▼
                ┌─────────────────┐
                │ 选择 Coding Agent│
                └────────┬────────┘
                         ▼
                ┌─────────────────┐
                │  登录 KunCode    │
                └────────┬────────┘
                         ▼
                ┌─────────────────┐
                │   选择模型       │
                └────────┬────────┘
                         ▼
                ┌─────────────────┐
                │   配置预览       │
                └────────┬────────┘
                         ▼
                ┌─────────────────┐
                │ 备份 → 写入配置  │
                └────────┬────────┘
                         ▼
                ┌─────────────────┐
                │   API 连通测试   │
                └────────┬────────┘
                         ▼
                ┌─────────────────┐
                │   🎉 配置完成    │
                └────────┬────────┘
                         ▼
                ┌─────────────────┐
                │   启动 Codex     │
                └─────────────────┘
```
