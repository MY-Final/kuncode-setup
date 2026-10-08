# Phase 5 - 工具详情与配置中心化 - 已完成

状态: achieved
仓库: D:\Repos\kuncode-setup
依赖: Phase 3

## 背景

目前「配置」只有一次性向导：配置完成后，用户想换模型、看当前用的是哪把密钥、
看程序到底改了哪些文件，都只能重跑整条向导或去翻配置文件。
对比 CCS 这类工具，缺少一个「管理已配置工具」的详情页。

本阶段把「已配置工具」变成可查看、可管理的对象，并补齐几个低成本高感知的
体验项。不引入本地代理、协议转换、Header/Body 覆盖等高级能力——那与
「面向小白、直连站点」的定位冲突。

## 交付内容

- 工具详情页：新增 /tools/:agent 路由，展示当前绑定的密钥、分组、模型列表、
  配置路径与状态，并提供换模型 / 换绑密钥 / 恢复备份 / 重新配置入口
- 查看实际写入的配置：后端 tool_detail + mask_config_text，先替换真实密钥、
  再兜底抹掉 sk- 形态字符串；前端只读展示脱敏后的 config.toml / settings.json
- 连接测速：connection_latency + ping_connection，设置页可测速并显示延迟；
  换绑弹窗支持「自动选择最快连接」
- 连接备注与别名：ConnectionSummary 增加 alias / note，新增 rename_connection；
  设置页可编辑，列表更可读
- 密钥一键复制：reveal_site_token_for_copy + reveal_site_token_key，密钥中心
  「复制」按钮走 reveal 接口，仅内存中转、只写系统剪贴板，不写入日志

## 新增命令

- rename_connection
- tool_detail
- reveal_site_token_key
- ping_connection

（均已在 src-tauri/src/lib.rs 注册）

## 验证（实际执行）

- cargo test 通过（21 项，新增 mask_config_text 脱敏测试）
- cargo clippy --all-targets -- -D warnings 通过
- cargo fmt --check 通过
- pnpm typecheck 通过
- pnpm test 通过（17 项，新增详情页、密钥复制、连接改名测试）
- pnpm build 通过
- pnpm prettier --check . 通过
- 浏览器实测：/tools/codex 路由与渲染正常

## 后续候选（未纳入本阶段）

- 模型目录/别名映射（写入 Codex model_catalog）
- 用量趋势图 + 自定义告警阈值
- 配置导入/导出（换机迁移）
- 批量检测与一键修复全部异常工具
- 最近使用 / 启动历史
