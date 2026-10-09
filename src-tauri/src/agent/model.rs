use serde::{Deserialize, Serialize};

/// 统一的 Agent 配置模型。
/// 前端「不应该」出现大量 if codex / if claude / if opencode，
/// 所有差异都由各 Provider 在 Rust 层消化。
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub agent_id: String,
    /// 默认模型；写入客户端的主模型字段。
    pub model: String,
    /// 允许使用的模型集合；空表示只有 `model`。
    #[serde(default)]
    pub models: Vec<String>,
    #[serde(default)]
    pub advanced: AdvancedConfig,
    pub base_url: String,
    /// 明文 API Key，只在内存 / 安全存储中出现，禁止写入日志。
    pub api_key: String,
}

/// Non-secret model overrides persisted with the binding and its backup.
#[derive(Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvancedConfig {
    #[serde(default)]
    pub models: std::collections::BTreeMap<String, ModelSettings>,
}

#[derive(Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelSettings {
    pub name: Option<String>,
    pub image_input: Option<bool>,
    pub reasoning: Option<bool>,
    pub context_window: Option<u64>,
    pub max_output_tokens: Option<u64>,
    pub reasoning_effort: Option<String>,
    #[serde(default)]
    pub reasoning_efforts: Vec<String>,
    pub thinking_budget: Option<u64>,
    /// OpenCode model SDK options, e.g. provider-specific reasoning settings.
    pub options: Option<serde_json::Map<String, serde_json::Value>>,
    pub variants:
        Option<std::collections::BTreeMap<String, serde_json::Map<String, serde_json::Value>>>,
}

impl AdvancedConfig {
    pub fn validate(&self, agent: &str, selected: &[String]) -> crate::error::AppResult<()> {
        use crate::error::AppError;
        let invalid = |message: &str| AppError::Other(message.into());
        for (model, settings) in &self.models {
            if !selected.contains(model) {
                return Err(invalid("高级配置只能关联已选模型"));
            }
            for limit in [settings.context_window, settings.max_output_tokens]
                .into_iter()
                .flatten()
            {
                if limit == 0 || limit > i32::MAX as u64 {
                    return Err(invalid("Token 限制必须是 1 至 2147483647 的整数"));
                }
            }
            if settings
                .thinking_budget
                .is_some_and(|budget| (budget > 0 && budget < 1024) || budget > i32::MAX as u64)
            {
                return Err(invalid("思考预算应为 0（关闭）或至少 1024 Token"));
            }
            if settings
                .context_window
                .zip(settings.max_output_tokens)
                .is_some_and(|(context, output)| output > context)
            {
                return Err(invalid("输出上限不能大于上下文窗口"));
            }
            if settings
                .thinking_budget
                .zip(settings.max_output_tokens)
                .is_some_and(|(thinking, output)| thinking >= output)
            {
                return Err(invalid("思考预算必须小于输出上限"));
            }
            if !settings.reasoning_efforts.is_empty()
                && settings
                    .reasoning_effort
                    .as_ref()
                    .is_some_and(|effort| !settings.reasoning_efforts.contains(effort))
            {
                return Err(invalid("默认思考程度必须在所选档位中"));
            }
            for effort in settings
                .reasoning_effort
                .iter()
                .chain(settings.reasoning_efforts.iter())
            {
                let allowed: &[&str] = if agent == "claude" {
                    &["low", "medium", "high", "xhigh", "max"]
                } else {
                    &[
                        "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra",
                    ]
                };
                if !allowed.contains(&effort.as_str()) {
                    return Err(invalid("无效的思考程度"));
                }
            }
            if agent != "opencode"
                && (settings.name.is_some()
                    || settings.image_input.is_some()
                    || settings.reasoning.is_some()
                    || settings.options.is_some()
                    || settings.variants.is_some())
            {
                return Err(invalid("此工具不支持 OpenCode 模型属性"));
            }
            if agent == "opencode"
                && (settings.context_window.is_some() != settings.max_output_tokens.is_some())
            {
                return Err(invalid("OpenCode 的上下文与输出上限必须一起填写"));
            }
            if agent == "opencode" && settings.thinking_budget.is_some() {
                return Err(invalid("OpenCode 的思考预算请在模型 SDK 选项中配置"));
            }
            if agent == "codex"
                && (settings.max_output_tokens.is_some() || settings.thinking_budget.is_some())
            {
                return Err(invalid("Codex 不支持单独覆盖输出上限或思考预算"));
            }
            if agent == "claude" && settings.context_window.is_some() {
                return Err(invalid(
                    "Claude Code 的上下文由模型决定，不能覆盖 Token 窗口",
                ));
            }
            if settings
                .name
                .as_ref()
                .is_some_and(|name| name.trim().is_empty() || name.len() > 256)
            {
                return Err(invalid("模型显示名称必须是 1 至 256 个字符"));
            }
            // These maps are plain-text metadata, never a second credential store.
            for value in [
                serde_json::to_value(&settings.options)?,
                serde_json::to_value(&settings.variants)?,
            ] {
                fn contains_secret(value: &serde_json::Value) -> bool {
                    match value {
                        serde_json::Value::Object(map) => map.iter().any(|(key, value)| {
                            let key = key.to_ascii_lowercase().replace('_', "");
                            [
                                "apikey",
                                "token",
                                "accesstoken",
                                "refreshtoken",
                                "secret",
                                "password",
                                "authorization",
                                "cookie",
                                "baseurl",
                                "headers",
                            ]
                            .contains(&key.as_str())
                                || contains_secret(value)
                        }),
                        serde_json::Value::Array(items) => items.iter().any(contains_secret),
                        _ => false,
                    }
                }
                if contains_secret(&value) || value.to_string().len() > 32768 {
                    return Err(invalid(
                        "模型选项不能包含凭据、连接地址或请求头，且不得超过 32 KB",
                    ));
                }
            }
        }
        Ok(())
    }

    pub fn summary(&self) -> Vec<String> {
        self.models
            .iter()
            .filter(|(_, settings)| **settings != ModelSettings::default())
            .map(|(model, _)| format!("写入 {model} 的高级模型配置"))
            .collect()
    }
}

impl AgentConfig {
    /// 实际要写入客户端的模型列表，始终至少包含默认模型。
    pub fn effective_models(&self) -> Vec<String> {
        let mut models: Vec<String> = self
            .models
            .iter()
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
            .map(str::to_owned)
            .collect();
        if !models.iter().any(|item| item == &self.model) {
            models.insert(0, self.model.clone());
        }
        models
    }
}

/// 即将写入的配置预览（API Key 已掩码）。
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPreview {
    pub agent_id: String,
    pub agent_name: String,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    /// 掩码后的 Key，例如 sk-••••••••1234
    pub masked_api_key: String,
    /// 将写入的配置文件路径
    pub config_path: Option<String>,
    /// 原配置是否存在（决定是否备份）
    pub existing_config: bool,
    /// 备份文件路径（若存在）
    pub backup_path: Option<String>,
    /// 会发生变化的摘要说明
    pub changes: Vec<String>,
}

/// 连通性测试结果。
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    pub ok: bool,
    pub latency_ms: Option<u64>,
    pub message: String,
}

/// 把 API Key 掩码成 sk-••••••••1234 形式。
pub fn mask_api_key(key: &str) -> String {
    let len = key.chars().count();
    if len <= 8 {
        return "•".repeat(len.max(4));
    }
    let head: String = key.chars().take(3).collect();
    let tail: String = key.chars().skip(len - 4).collect();
    format!("{head}••••••••{tail}")
}
