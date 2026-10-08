# 任务看板

本目录用三个状态目录管理 KunCode Setup 的改造任务：

- `pending/` —— 待开始
- `doing/` —— 进行中
- `achieved/` —— 已完成

每张任务卡是一份 Markdown，文件名即任务标识，内容包含：目标、仓库/分支、
交付项清单、安全/设计要点、验收方式。

## 产品主线

把 KunCode Setup 从「一次性配置向导」升级为 KunCode 定制版的「密钥中心」客户端：
用户登录后在客户端里管理站点密钥（token），选密钥 + 分组，选择要配置的
Coding 客户端（Codex / Claude Code / OpenCode）与这些客户端可用的模型，类似
CC Switch 但为本站定制，面向小白用户。

## 阶段划分

| 阶段    | 内容                                         | 仓库          |
| ------- | -------------------------------------------- | ------------- |
| Phase 0 | 服务端桌面密钥接口 + scope                   | new-api       |
| Phase 1 | 客户端密钥中心 MVP（列表 + 绑定已有密钥）    | kuncode-setup |
| Phase 2 | 多模型 + 分组选择 + 密钥增删改               | 双仓          |
| Phase 3 | 切换密钥/模型、启动前一致性校验、恢复备份    | kuncode-setup |
| Phase 4 | 首页 Dashboard 化、余额预警、删除引用确认    | kuncode-setup |
| Phase 5 | 工具详情与配置中心化（测速、配置查看、备注） | kuncode-setup |

Phase 0 已完成，见 `achieved/phase-0-desktop-keys-api.md`。
Phase 1 已完成，见 `achieved/phase-1-key-center-mvp.md`。
Phase 2 已完成，见 `achieved/phase-2-multi-model-and-groups.md`。
Phase 3 已完成，见 `achieved/phase-3-switch-and-consistency.md`。
Phase 4 已完成，见 `achieved/phase-4-polish.md`。
Phase 5 已完成，见 `achieved/phase-5-tool-detail-center.md`。
