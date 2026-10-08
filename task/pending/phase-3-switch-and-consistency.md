# Phase 3 - 切换与一致性

状态: pending
仓库: D:\Repos\kuncode-setup
依赖: Phase 2

## 目标

让「换密钥 / 换模型」不需要重跑整条向导，并保证本机配置与站点一致。

## 交付项

- [ ] 切换密钥 = 重跑单 agent 的 apply
- [ ] 启动前一致性校验（复用 configuration_matches）
- [ ] 失效密钥一键换绑
- [ ] 补「恢复备份」入口（restore_file 目前是死代码）
- [ ] Codex auth.json 改合并写入（避免抹掉 ChatGPT 登录态）

## 验收

- 站点删除/停用密钥后，启动前能明确提示并可一键换绑
