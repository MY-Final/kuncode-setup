# Phase 2 - 多模型 + 分组 + 密钥增删改

状态: doing
仓库: D:\Repos\kuncode-setup（+ new-api 配合）
依赖: Phase 1

## 目标

在客户端内完成密钥新建/改分组/删除，并支持为客户端选择多个模型。

## 交付项

- [x] AgentConfig.model -> models: Vec<String>
- [x] Codex 写 profiles；Claude 写默认模型 + 提示会话内切换；OpenCode 写模型列表
- [x] 绑定向导加「选模型（可多选，第一个为默认）」
- [x] 客户端密钥新建 / 改分组 / 删除 UI
- [x] 模型限制写入 token.ModelLimits（服务端强制）

## 验收

- 三个客户端配置写入正确；模型限制在服务端生效
