# Phase 3 - 切换与一致性 - 已完成

状态: achieved
仓库: D:\Repos\kuncode-setup
依赖: Phase 2

## 交付内容

- 核心模型：新增 check_binding，复用各 Provider 的 configuration_matches
  校验本机配置，再通过读取模型列表判断绑定密钥是否失效，
  返回结构化 BindingCheck（reason: ok/config/key/network，含 needsRebind）
- 核心模型：新增 restore_agent，用最近一次备份恢复工具配置并解除本机绑定；
  config 新增 latest_backup，识别带时间戳的备份文件（restore_file 不再是死代码）
- 命令层：注册 check_tool_connection 与 restore_tool_config
- 前端：启动前调用 checkToolConnection，区分密钥失效 / 配置损坏 / 网络问题；
  网络不可用不阻断启动，仅提示
- 前端：新增 RebindDialog，为已配置工具重选密钥、分组与模型并重跑单 agent apply
- 前端：操作对话框支持多个后续动作；工具列表新增「换绑密钥」「恢复备份」按钮
- Codex auth.json 合并写入已在 Phase 2 完成

## 验证（实际执行）

- cargo test 通过（20 项，新增 latest_backup/restore_file 往返测试）
- pnpm lint:rust（clippy -D warnings）通过
- pnpm typecheck 通过
- pnpm test 通过（11 项，新增失效密钥一键换绑流程测试）
- pnpm build 通过
- prettier / cargo fmt 检查通过

## 后续依赖（进入 Phase 4）

- 首页 Dashboard 化、余额预警、删除引用确认、缓存离线降级、安装引导
