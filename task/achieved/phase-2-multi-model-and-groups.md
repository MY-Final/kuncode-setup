# Phase 2 - 多模型 + 分组 + 密钥增删改 - 已完成

状态: achieved
仓库: D:\Repos\kuncode-setup（+ new-api 配合）
依赖: Phase 1

## 交付内容

- 核心模型：AgentConfig.model 扩展为默认模型 + models: Vec<String>，
  新增 effective_models()（始终包含默认模型）
- Codex：写 kuncode-N profiles；auth.json 改为合并写入，
  保留已有 ChatGPT 登录态（tokens）
- OpenCode：写入完整模型 map
- Claude：保持默认模型，预览中提示可在会话内用 /model 切换
- 连接层：ToolBinding 新增 models；preview/apply 改为传递模型列表，
  apply 用 ApplySelection（model + models + tokenId + group）
- 命令层：preview_connection_config 增加 models；
  apply_connection_config 改为 selection 参数对象
- 绑定向导：模型阶段由单选改为多选，第一个勾选的为默认模型，
  可「设为默认」；手填模型 ID 时把输入作为默认模型
- 密钥中心：新建/编辑密钥时按分组加载模型并可多选，
  写入 model_limits，由服务端强制生效
- 浏览器 mock：group_models 支持多模型

## 验证（实际执行）

- cargo test 通过（19 项）
- pnpm lint:rust（clippy -D warnings）通过
- pnpm typecheck 通过
- pnpm test 通过（10 项，覆盖多选写入的模型列表）
- pnpm build 通过
- prettier / cargo fmt 检查通过

## 服务端（new-api）

- POST/PUT /api/desktop/keys 已接收并持久化 model_limits 到 token.ModelLimits
- 绑定时 DesktopBindToken 将所选 models 写入 token.ModelLimits
- GET /api/user/models?group= 提供分组可用模型
- 以上能力 Phase 2 期间已具备，无需新增改动

## 后续依赖（进入 Phase 3）

- 切换密钥/模型复用单 agent apply
- 启动前一致性校验、失效密钥一键换绑
- 恢复备份入口
