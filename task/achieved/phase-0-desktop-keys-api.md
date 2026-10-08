# Phase 0 - 服务端桌面密钥接口（new-api）- 已完成

状态: achieved
仓库: D:\Repos\new-api （分支 codex/desktop-authorization）

## 交付内容

- 新增 scope desktop_keys:read / desktop_keys:write / desktop_keys:reveal，
  由 model.DesktopGrantedScopes() 统一发放（model/desktop_auth.go）
- 新增 model/desktop_keys.go：ListDesktopTokens / CreateDesktopToken /
  UpdateDesktopToken / DeleteDesktopToken / BindDesktopTool /
  DesktopTokenBoundAgents / SummarizeDesktopKey
- 新增 controller/desktop_keys.go：列表、详情、创建、修改、删除、reveal
- PUT /api/desktop/tools/:agent 扩展：token_id + group + models 绑定已有密钥；
  缺省 model 时保留旧的自动建密钥行为（向后兼容）
- 门禁登记：middleware/access_token_routes.go（scope 规则）+
  middleware/auth.go（桌面白名单），路由注册在 router/api-router.go
- 授权页 scope 说明与 7 个语言文案同步更新；docs/authentication.md 补齐接口表

## 安全实现要点

- 全部查询/修改带 user_id 过滤（复用 GetTokenByIds / GetAllUserTokens）
- 创建前 lockForUpdate 锁用户行再计数，防并发超 maxTokens
- 写操作走 token.Update()/Delete() 触发缓存失效；BindDesktopTool 用 tx.Save 时手动
  invalidateTokenCacheForMutation
- 分组用 IsUserSelectableGroup 校验；模型用分组启用模型集合校验
- 列表/详情永远掩码；明文仅在创建响应（一次性）与 reveal（独立 scope）返回
- 删除被工具引用的密钥返回 409 DESKTOP_KEY_IN_USE
- 审计 action：desktop.key.create/update/delete/reveal、desktop.tool.bind，不落明文

## 验证（实际执行）

- go build ./... 通过
- go test ./controller/... ./middleware/... ./router/... 通过
- 新增 4 个测试：TestDesktopKeyCenterLifecycle、TestDesktopKeysAreIsolatedByOwner、
  TestDesktopKeyGroupAndModelValidation、TestDesktopKeyRoutesRequireWriteScope
- 网站授权页 vitest 5 项通过；7 个 locale JSON 校验通过

## 后续依赖（进入 Phase 1）

- Setup 客户端需接入 /api/desktop/keys 与新版 tools/:agent
- 已授权的旧桌面 token 不含新 scope，需重新登录或按 auth_version 失效重授
