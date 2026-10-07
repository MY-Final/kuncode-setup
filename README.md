# KunCode Setup

AI Coding Agent 配置助手 — 专为 KunCode / NewAPI 用户打造。

用户不需要理解 API Key、Base URL、Provider、环境变量或配置文件，
只需登录 KunCode、选择 AI Coding 工具和模型，即可自动完成本机配置并验证连接。

MVP 支持：**Codex** · **Claude Code** · **OpenCode**（平台：Windows 优先）

## 技术栈

| 层       | 技术                                 |
| -------- | ------------------------------------ |
| 桌面框架 | Tauri 2                              |
| 前端     | React 19 + TypeScript + Vite         |
| UI       | shadcn/ui 风格组件 + Tailwind CSS v4 |
| 路由     | React Router 7                       |
| 后端     | Rust                                 |

## 目录结构

```
kuncode-setup/
├── prd/                      # 产品需求文档
│   └── mvp/mvp.md
├── src/                      # 前端 (React)
│   ├── components/
│   │   ├── layout/           # 布局：侧边栏、页头
│   │   ├── ui/               # shadcn/ui 风格基础组件
│   │   └── status.tsx        # 状态图标 / 圆点
│   ├── lib/
│   │   ├── tauri/            # Tauri command 封装（唯一的系统操作入口）
│   │   │   ├── api.ts
│   │   │   └── mock.ts       # 浏览器开发时的假数据
│   │   ├── store.tsx         # 全局状态（环境 / Agent / 会话 / 草稿）
│   │   ├── types.ts          # 与 Rust 对齐的类型
│   │   └── utils.ts
│   └── pages/                # 页面
│       ├── home.tsx          # 首页
│       ├── setup.tsx         # /setup/:agent 配置流程
│       ├── models.tsx        # 模型选择
│       ├── diagnose.tsx      # 系统诊断
│       └── settings.tsx      # 设置
└── src-tauri/                # 后端 (Rust)
    └── src/
        ├── agent/            # Agent Provider 抽象
        │   ├── provider.rs   # 统一 trait
        │   ├── codex.rs
        │   ├── claude.rs
        │   ├── opencode.rs
        │   ├── launch.rs     # 启动 CLI
        │   └── model.rs      # 统一配置模型
        ├── env/              # 环境检测
        ├── connections/      # Rust 连接、PKCE 登录、HTTP 和凭据管理器
        ├── config.rs         # 备份 / 恢复
        ├── error.rs
        └── lib.rs            # Tauri commands 注册
```

## 架构原则

> **所有系统级操作必须经过 Rust，不允许 React 直接操作用户文件系统。**

- 前端不出现大量 `if codex / if claude / if opencode`，差异由 Rust 的
  `AgentProvider` trait 消化。
- 新增 Agent 只需实现 `AgentProvider`：环境检测、预览、备份、配置、配置匹配和启动。
- 任何配置修改前先备份（`*.kuncode.bak`），失败可恢复。
- API Key 禁止 `console.log`、禁止写入日志 / 遥测，UI 一律掩码显示。

## 贡献

提交规范、分支模型与代码约定见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 开发

```bash
pnpm install

# 纯前端开发（自动使用 mock 数据，无需 Tauri 环境）
pnpm dev

# 桌面应用开发
pnpm tauri:dev

# 打包
pnpm tauri:build

# 前端检查与生产构建
pnpm typecheck
pnpm build

# Rust 静态检查
pnpm lint:rust

# 仅构建桌面可执行文件（不生成安装包）
pnpm tauri build --debug --no-bundle
```

前端和桌面开发二选一启动，二者都使用 1420 端口。桌面默认窗口为
1280 × 800，保留原生标题栏与窗口控制；小窗口会自动收缩导航。

## 首版界面与交互

- **首页**：Codex、Claude Code、OpenCode 三个横向启动项，按配置状态显示启动、配置或修复。
- **工具配置**：选择连接 → 选择实际可用模型 → 预览 → 确认配置。每个工具可独立绑定站点。
- **进度**：浏览器授权和本机配置均使用现有小型 Dialog，可取消浏览器等待。
- **系统诊断**：独立检查环境、工具安装与已配置服务；网络暂不可用不会直接标记配置损坏。
- **设置**：外观、账户和应用信息。KunCode 账户下的高级选项可设置授权服务根地址。

## 登录与连接

| 方式         | 凭据用途                            | 工具密钥                                  |
| ------------ | ----------------------------------- | ----------------------------------------- |
| 登录 KunCode | 系统浏览器登录、二次验证、PKCE 授权 | 服务端自动创建或复用独立工具密钥          |
| 用户 Token   | 第三方 New API 账户管理接口         | 通过通用接口创建，不调用 KunCode 专用接口 |
| API Key      | 模型调用服务                        | 使用用户提供的密钥，不显示账户已登录      |

浏览器授权默认连接 `https://kuncode.120403.xyz`，授权有效期为 30 天，到期重新登录。
React 只接收账户摘要、模型和进度，不接收授权令牌或自动创建的工具密钥。
用户 Token 模式需要资料、模型和 API 密钥管理权限；不兼容时明确提示改用已有 API Key。
旧站点可在连接高级选项填写用户 ID。无法确认创建结果时，只核对本次创建记录，不重复创建。

### 本地测试授权

1. 启动最新 `D:\Repos\new-api` 的后端和授权页，推荐先执行 `cd web`、`bun run build`，再回到仓库根运行 `go run .`。
2. 在 new-api 的站点设置中将 `ServerAddress` 设置为 `http://127.0.0.1:3000`（端口按实际修改）。本地 HTTP 使用 `SESSION_COOKIE_SECURE=false`，不设置 `SESSION_COOKIE_TRUSTED_URL`；保留固定、非空的本地 `SESSION_SECRET`。
3. 启动桌面应用 `pnpm tauri:dev`，进入 **设置 → KunCode 账户 → 授权服务地址（高级）**，填写同一个根地址并保存。不要附加 `/api` 或 `/v1`。
4. 点击 **登录 KunCode**，在系统浏览器登录本地账户并批准授权，回到 Setup 选择工具和模型，确认后写入配置。

改地址只影响下一次浏览器登录；已有账户、工具绑定和工具凭据仍属于原站点。
两端地址必须完全一致；`localhost` 和 `127.0.0.1` 会被视为不同源。new-api 默认 `ServerAddress` 是 `http://localhost:3000` 时，Setup 也填写该地址，或同时修改两端。
登录 Dialog 会显示当前授权服务地址，返回的授权页必须同源；正式站点要求 HTTPS，只允许回环 HTTP 用于本地开发。
若服务未上线桌面授权接口，仍可使用手动连接入口。

### 演示与本机能力

浏览器使用 `src/lib/tauri/mock.ts` 的独立演示数据，不读写用户文件，也不发送
API 测试请求。模型目录位于 `src/lib/data/models.ts`，不代表真实可用性或价格。
浏览器预览不能执行真实登录、导入、配置或启动；演示结果只保留在内存。

桌面端使用 Rust HTTP 客户端，禁用网络重定向，不通过 curl 参数传递凭据。
Windows 凭据管理器保存管理凭据和工具密钥；应用数据目录的 `connections.json` 只保存非敏感信息、安装 ID 和绑定。
预览不创建密钥。用户确认后执行环境检查、获取密钥、备份、写入和模型列表检查。
写入失败会恢复原配置；检查模型列表不执行付费推理，也不等同于实际模型调用验证。

退出 KunCode 会尝试撤销本应用的桌面授权；离线退出明确提示远端撤销未完成。
断开手动连接只清理本机管理凭据，不撤销用户原有 Token。
两种退出都保留工具配置和工具密钥，已配置的工具可继续启动。

## Tauri Commands

| Command                        | 说明                                |
| ------------------------------ | ----------------------------------- |
| `detect_environment`           | 检测 OS / 架构 / Node / npm / Git   |
| `list_agents`                  | 列出 Agent 及安装状态               |
| `list_connections`             | 恢复连接摘要、授权地址和工具绑定    |
| `set_authorization_site`       | 保存浏览器授权服务根地址            |
| `start_login` / `cancel_login` | 浏览器授权开始与取消                |
| `import_connection`            | 导入明确类型的用户 Token 或 API Key |
| `connection_models`            | 获取实际模型列表                    |
| `logout_connection`            | 退出连接，保留工具                  |
| `preview_connection_config`    | 预览，不创建密钥                    |
| `apply_connection_config`      | 确认后获取密钥、备份、写入与检查    |
| `probe_tool_connection`        | 使用独立工具密钥检查模型列表        |
| `launch_agent`                 | 启动对应 CLI                        |

## 验证

`pnpm test`、`pnpm typecheck`、`pnpm build`；Rust 使用 `cargo test --manifest-path src-tauri/Cargo.toml` 和 `pnpm lint:rust`。
测试覆盖真实 Windows 凭据管理器、地址持久化和站点隔离、退出保留工具、旧接口兼容、丢失创建响应不重复创建、取消迟到结果，以及三个工具的独立配置写入。
测试写入隔离临时目录，不改用户现有工具配置。网站批准授权和真实 CLI 调用仍需按上述步骤在本机人工验收。
