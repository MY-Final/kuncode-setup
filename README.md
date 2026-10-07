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
        │   ├── http_test.rs  # 连通性测试
        │   ├── launch.rs     # 启动 CLI
        │   └── model.rs      # 统一配置模型
        ├── env/              # 环境检测
        ├── config.rs         # 备份 / 恢复
        ├── error.rs
        └── lib.rs            # Tauri commands 注册
```

## 架构原则

> **所有系统级操作必须经过 Rust，不允许 React 直接操作用户文件系统。**

- 前端不出现大量 `if codex / if claude / if opencode`，差异由 Rust 的
  `AgentProvider` trait 消化。
- 新增 Agent 只需实现 `AgentProvider`：`detect / get_config / backup / configure / test / launch`。
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
```

## Tauri Commands

| Command              | 说明                              |
| -------------------- | --------------------------------- |
| `detect_environment` | 检测 OS / 架构 / Node / npm / Git |
| `list_agents`        | 列出 Agent 及安装状态             |
| `preview_config`     | 生成配置预览（Key 已掩码）        |
| `apply_config`       | 备份 + 写入配置，逐步返回结果     |
| `test_connection`    | 测试 KunCode API 连通性           |
| `launch_agent`       | 启动对应 CLI                      |

## 状态

- [x] Phase 1 项目初始化
- [x] Phase 2 环境检测（Rust + UI）
- [ ] Phase 3 KunCode 登录 / Setup API / 模型列表（当前为占位数据，待接入真实接口）
- [x] Phase 4 Codex Provider 骨架
- [x] Phase 5 Claude Code / OpenCode Provider 骨架
- [ ] Phase 6 API Test / Diagnosis / Backup-Restore（骨架已就绪，待完善）
- [ ] Phase 7 Windows 打包 / Installer
