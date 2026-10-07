# 贡献指南

## 分支模型

| 分支         | 用途                             |
| ------------ | -------------------------------- |
| `main`       | 稳定分支，始终保持可构建、可发布 |
| `feat/*`     | 新功能开发                       |
| `fix/*`      | 缺陷修复                         |
| `refactor/*` | 重构                             |
| `chore/*`    | 杂项（依赖升级、配置调整等）     |

> 直接在 `main` 上提交只适用于初始化、文档等低风险改动。

## 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>
```

- **type**（必填，见下表）
- **scope**（可选）：受影响模块，如 `rust`、`ui`、`codex`、`env`、`router`
- **subject**：一句话描述改动，使用简体中文，不以句号结尾

### 允许的 type

| type       | 说明                                       |
| ---------- | ------------------------------------------ |
| `feat`     | 新功能                                     |
| `fix`      | 缺陷修复                                   |
| `docs`     | 仅文档变更                                 |
| `style`    | 代码格式（不影响逻辑，如空格、缩进、分号） |
| `refactor` | 重构（既不新增功能也不修复缺陷）           |
| `perf`     | 性能优化                                   |
| `test`     | 新增或修改测试                             |
| `build`    | 构建系统或依赖变更                         |
| `ci`       | CI 配置变更                                |
| `chore`    | 其它不修改源码或测试的杂项                 |
| `revert`   | 回滚某次提交                               |

### 示例

```
feat(rust): 新增 OpenCode Provider 配置写入
fix(ui): 修复配置预览页 API Key 掩码截断问题
docs: 补充 Windows 打包说明
build: 升级 Tauri 到 2.12
chore: 初始化 husky 提交钩子
```

### 破坏性变更

在 type 后加 `!`，并在 footer 中说明：

```
feat(rust)!: 调整 AgentProvider trait 的测试接口

BREAKING CHANGE: test() 现在返回 TestResult 而非 bool。
```

## 提交钩子

仓库已配置 Husky，提交时会自动执行：

- **pre-commit**：`lint-staged`
  - `*.{ts,tsx,js,jsx,json,css,html,md}` → Prettier 格式化
  - `*.rs` → `rustfmt`
- **commit-msg**：`commitlint` 校验提交信息格式

首次克隆后执行一次 `pnpm install` 即可安装钩子（`prepare` 脚本自动完成）。

## 本地检查

提交前建议手动跑一遍：

```bash
pnpm typecheck     # TypeScript 类型检查
pnpm build         # 前端构建
pnpm lint:rust     # Rust clippy（-D warnings）
cargo build --manifest-path src-tauri/Cargo.toml
```

## 代码约定

- 前端：2 空格缩进，Prettier 统一格式
- Rust：4 空格缩进，`rustfmt` 统一格式，提交前 `clippy` 无警告
- 换行符：仓库内统一 LF（见 `.gitattributes`）
- 所有系统级操作（文件、环境变量、CLI）必须经由 Rust，React 不直接触碰文件系统
- API Key / Token / 密码禁止写入日志、遥测与提交内容
