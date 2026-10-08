# Phase 1 - 客户端密钥中心 MVP（kuncode-setup）- 已完成

状态: achieved
仓库: D:\Repos\kuncode-setup

## 交付内容

- 后端 http.rs：SiteConnection / SiteToken / SiteGroup 类型 +
  list_site_tokens / reveal_site_token / create_site_token / update_site_token /
  delete_site_token / user_groups / group_models
  （桌面授权走 /api/desktop/keys，用户 Token 走 /api/token/*，同一实现兼容两种连接）
- 后端 connections/mod.rs：site_tokens / site_groups / site_group_models /
  create_site_token / update_site_token / delete_site_token；
  apply() 新增 token_id + group 入参，选定密钥时走 reveal_site_token 绑定已有密钥，
  缺省时保留旧的自动建密钥流程；ToolBinding 新增 group 字段（serde default 兼容旧状态）
- 后端 lib.rs：注册 list_site_tokens / site_groups / group_models /
  create_site_token / update_site_token / delete_site_token；
  apply_connection_config 增加 tokenId / group 参数
- 类型：新增 SiteToken / SiteGroup；ToolBinding 与 ToolConfiguration 增加 group / tokenId
- 页面：新增 /keys（密钥列表 + 新建/编辑/删除 + 绑定状态），侧边栏新增「密钥与分组」
- 配置流程：setup.tsx 新增「选择密钥」阶段（连接 -> 密钥+分组 -> 模型 -> 预览）；
  Stepper 变为 4 步；选择密钥后按分组拉取可用模型
- 浏览器 mock：新增 mockListSiteTokens / mockSiteGroups / mockGroupModels

## 验证（实际执行）

- pnpm typecheck 通过
- pnpm build 通过（keys chunk 正常产出）
- pnpm test 通过（10 项）
- cargo test 通过（19 项）
- pnpm lint:rust（clippy -D warnings）通过
- 浏览器截图确认 /keys 页面渲染正常

## 后续依赖（进入 Phase 2）

- 多模型选择：AgentConfig.model -> models，三个 Provider 支持多模型
- 密钥新建时选择模型限制（当前 MVP 先建空限制，Phase 2 补齐）
