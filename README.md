# KunCode Setup

KunCode 定制版 AI Coding Agent 密钥中心，面向 **Codex**、**Claude Code** 和 **OpenCode** 用户。
在桌面客户端管理站点连接、密钥与分组，并把所选密钥和模型配置到本机工具；也可以查看配置、切换绑定、恢复备份并启动工具。

平台当前以 **Windows** 为主。

## 技术栈

| 层       | 技术                                 |
| -------- | ------------------------------------ |
| 桌面框架 | Tauri 2                              |
| 前端     | React 19 + TypeScript + Vite         |
| UI       | shadcn/ui 风格组件 + Tailwind CSS v4 |
| 路由     | React Router 7                       |
| 后端     | Rust                                 |

## 主要功能

- **首页 Dashboard**：查看 Coding 工具的安装、配置与连接状态，并快速启动或处理异常。
- **密钥中心**：查看站点密钥和分组，创建、编辑、复制或删除密钥；按分组配置模型限制，并显示额度和工具引用状态。
- **工具配置**：选择站点连接、密钥、分组和模型，预览后写入 Codex、Claude Code 或 OpenCode 配置。
- **工具详情**：查看当前绑定、服务地址、模型和脱敏后的配置文件；支持换绑、重新配置和恢复备份。
- **连接管理**：通过 KunCode 浏览器授权，或导入用户 Token / API Key；可维护多个站点连接、别名和备注，并检查延迟。
- **系统诊断与设置**：检查本机环境、工具安装和服务连接；支持主题、紧凑布局及授权服务地址设置。

## 目录结构

```
kuncode-setup/
├── prd/                      # 产品需求文档
├── task/                     # 任务看板与阶段记录
├── src/                      # 前端 (React)
│   ├── components/
│   │   ├── layout/           # 应用框架、侧边栏、页头
│   │   ├── setup/            # 配置步骤、配置预览
│   │   ├── ui/               # shadcn/ui 风格基础组件
│   │   └── ...               # Dashboard、连接、密钥和工具交互
│   ├── lib/
│   │   ├── tauri/            # Tauri command 封装及浏览器 mock
│   │   ├── data/             # 工具、模型和安装指南数据
│   │   ├── store.tsx         # 环境、工具、连接与配置状态
│   │   ├── cache.ts          # 离线列表缓存
│   │   └── types.ts          # 与 Rust 对齐的类型
│   └── pages/                # 首页、配置、密钥、工具详情、诊断和设置
└── src-tauri/                # 后端 (Rust)
    └── src/
        ├── agent/            # Agent Provider、配置和启动
        ├── env/              # 环境检测
        ├── connections/      # 站点连接、登录、密钥 API 和凭据管理
        ├── config.rs         # 工具配置备份 / 恢复
        ├── error.rs
        └── lib.rs            # Tauri commands 注册
```

## 架构与安全

> 所有系统级操作必须经过 Rust，不允许 React 直接操作用户文件系统。

- 文件系统、系统凭据和工具配置操作均由 Rust 后端执行；前端通过 Tauri commands 调用。
- 各工具差异由 Rust `AgentProvider` trait 封装，支持环境检测、配置、详情读取、匹配检查和启动。
- 修改工具配置前按批次创建备份（`*.kuncode.bak.<批次>`），记录文件原本是否存在、旧绑定和凭据快照引用；失败时同时回滚文件、凭据与本机绑定。
- 管理凭据和工具密钥保存在 Windows 凭据管理器；应用数据目录只保存非敏感连接信息、安装 ID 和绑定。
- 浏览器授权令牌和自动创建的工具密钥不传给 React；工具详情按敏感字段脱敏，Codex 凭据文件仅展示摘要，无法解析的配置不展示原文。密钥明文仅在创建或用户主动复制时短暂提供。

## 开发

环境要求：Node.js 20+、pnpm 11，以及运行 Tauri 所需的 Rust 和 Windows 开发环境。

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
pnpm test
pnpm format:check

# Rust 静态检查
pnpm lint:rust

# 仅构建桌面可执行文件（不生成安装包）
pnpm tauri build --debug --no-bundle
```

前端和桌面开发二选一启动，二者都使用 1420 端口。桌面默认窗口为 1280 × 800，保留原生标题栏与窗口控制；小窗口会自动收缩导航。

## 主要流程

1. 在 **设置** 中登录 KunCode，或导入支持的站点 Token / API Key 连接。
2. 在 **工具配置** 中选择工具和连接，点击 **快速配置**，选择模型并确认；程序使用账户默认分组，在确认后创建或复用专用密钥。API Key 连接直接使用导入的密钥。
3. 需要自选密钥和分组时，点击 **选择已有密钥**；也可以在 **密钥与分组** 中管理站点密钥。
4. 在首页启动已配置工具，或进入工具详情查看脱敏配置、换绑、重新配置和恢复备份。
5. 遇到问题时在 **系统诊断** 检查环境、工具安装和所选模型列表；可以主动运行 **测试实际调用** 验证默认模型及 Streaming，该测试会消耗少量额度。

## 登录与连接

| 方式         | 用途                                              |
| ------------ | ------------------------------------------------- |
| 登录 KunCode | 系统浏览器登录、二次验证、PKCE 授权及账户密钥管理 |
| 用户 Token   | 管理兼容 New API 接口的站点密钥和分组             |
| API Key      | 连接模型服务；使用用户提供的密钥                  |

浏览器授权默认连接 `https://kuncode.120403.xyz`。React 只接收账户摘要、密钥元数据、模型和进度，不接收授权令牌或工具配置所用密钥。用户 Token 模式需要站点资料、模型及 API 密钥管理权限。

### 本地测试授权

1. 启动最新 `D:\Repos\new-api` 的后端和授权页，推荐先执行 `cd web`、`bun run build`，再回到仓库根运行 `go run .`。
2. 在 new-api 的站点设置中将 `ServerAddress` 设置为 `http://127.0.0.1:3000`（端口按实际修改）。本地 HTTP 使用 `SESSION_COOKIE_SECURE=false`，不设置 `SESSION_COOKIE_TRUSTED_URL`；保留固定、非空的本地 `SESSION_SECRET`。
3. 启动桌面应用 `pnpm tauri:dev`，进入 **设置 → KunCode 账户 → 授权服务地址（高级）**，填写同一个根地址并保存。不要附加 `/api` 或 `/v1`。
4. 点击 **登录 KunCode**，在系统浏览器登录本地账户并批准授权，回到 Setup 管理密钥、选择工具和模型，确认后写入配置。

改地址只影响下一次浏览器登录；已有账户、工具绑定和工具凭据仍属于原站点。两端地址必须完全一致；`localhost` 和 `127.0.0.1` 会被视为不同源。正式站点要求 HTTPS，只允许回环 HTTP 用于本地开发。

若服务未上线桌面授权接口，仍可使用手动连接入口。

### 演示与本机能力

浏览器使用 `src/lib/tauri/mock.ts` 的演示数据，不读写用户文件或调用真实管理接口。浏览器预览不能执行真实登录、密钥管理、配置或启动；演示结果只保留在内存。`src/lib/data/models.ts` 中的模型数据用于演示，不代表真实可用性或价格。

桌面端使用 Rust HTTP 客户端并禁用网络重定向，不通过 curl 参数传递凭据。Windows 凭据管理器保存管理凭据、工具密钥和历史凭据快照；应用数据目录的 `connections.json` 只保存非敏感信息、安装 ID、绑定及备份清单。确认配置后才读取所需密钥、备份并写入工具配置。已有配置解析失败或无法读取时明确报错，不会当作空配置覆盖；解析错误时可选择独立的「备份并重建配置」，再次确认后才备份并重置该工具原有设置和登录信息。

常规连接检查核对所选模型是否在密钥可读取的模型列表中，不执行推理；不支持模型列表的站点显示为尚未验证。实际调用测试只在用户主动确认后发送一次短请求，分别使用 Responses、Messages 或 Chat Completions 协议，并要求收到文本及正常的 Streaming 结束事件；不保存响应内容。

恢复备份先检查整组文件和凭据快照，再恢复上一次完整配置与旧绑定；首次配置新增的文件会移除。旧版单文件备份仍可恢复，旧版 Codex 多文件散落备份需手动核对，避免把不同批次拼在一起。浏览器授权换绑失败时会尝试恢复原远端绑定，以及受影响密钥的分组和模型限制；远端恢复失败会明确提示核对站点。失败配置所创建的站点密钥保留供重试复用，不自动删除远端密钥。文件备份可能含原有凭据，不能当作脱敏资料分享。

退出 KunCode 会尝试撤销本应用的桌面授权；离线退出明确提示远端撤销未完成。断开手动连接只清理本机管理凭据，不撤销用户原有 Token。两种退出都保留工具配置和工具密钥，已配置的工具可继续启动。

## Tauri Commands

| Command                                         | 说明                                 |
| ----------------------------------------------- | ------------------------------------ |
| `detect_environment` / `list_agents`            | 检查系统环境并列出工具安装状态       |
| `list_connections` / `set_authorization_site`   | 读取连接状态或设置授权服务地址       |
| `start_login` / `cancel_login`                  | 启动或取消浏览器授权                 |
| `import_connection` / `logout_connection`       | 导入或退出站点连接                   |
| `connection_models` / `connection_profile`      | 读取连接可用模型和账户资料           |
| `list_site_tokens` / `site_groups`              | 列出站点密钥和分组                   |
| `group_models`                                  | 获取分组可用模型                     |
| `create_site_token` / `update_site_token`       | 创建或更新站点密钥                   |
| `delete_site_token` / `reveal_site_token_key`   | 删除密钥或主动读取密钥以复制         |
| `preview_connection_config`                     | 预览工具配置                         |
| `apply_connection_config`                       | 备份并应用工具配置                   |
| `tool_detail` / `check_tool_connection`         | 查看工具配置详情并检查当前绑定       |
| `restore_tool_config` / `probe_tool_connection` | 恢复工具配置备份或探测服务连接       |
| `rename_connection` / `ping_connection`         | 编辑本地连接名称、备注或测量连接延迟 |
| `launch_agent`                                  | 启动对应 CLI                         |
| `test_tool_inference`                           | 主动测试默认模型实际调用及 Streaming |

## 验证

前端运行 `pnpm test`、`pnpm typecheck`、`pnpm build` 和 `pnpm format:check`。Rust 运行 `cargo test --manifest-path src-tauri/Cargo.toml` 与 `pnpm lint:rust`。

测试涵盖连接管理、站点隔离、密钥操作及三个工具的配置逻辑。Rust 配置测试使用临时目录，不修改用户现有工具配置。浏览器批准授权、站点管理接口和真实 CLI 启动需在 Windows 桌面环境按上述步骤人工验收。

## 贡献

提交规范、分支模型与代码约定见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
