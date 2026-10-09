use std::path::PathBuf;

use super::model::{mask_api_key, AgentConfig, ConfigPreview};
use super::provider::AgentProvider;
use crate::config::{atomic_write, read_json_object};
use crate::env::{detect_cli, ToolStatus};
use crate::error::AppResult;

pub struct ClaudeCodeProvider;

impl ClaudeCodeProvider {
    fn config_path_inner(&self) -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(".claude").join("settings.json"))
    }
}

impl AgentProvider for ClaudeCodeProvider {
    fn id(&self) -> &'static str {
        "claude"
    }

    fn name(&self) -> &'static str {
        "Claude Code"
    }

    fn description(&self) -> &'static str {
        "Anthropic 官方 AI 编程工具"
    }

    fn detect(&self) -> ToolStatus {
        detect_cli("claude", "Claude Code", "claude", &["--version"])
    }

    fn config_path(&self) -> Option<PathBuf> {
        self.config_path_inner()
    }

    fn get_config(&self) -> AppResult<Option<String>> {
        match self.config_path() {
            Some(path) if path.exists() => Ok(Some(std::fs::read_to_string(path)?)),
            _ => Ok(None),
        }
    }

    fn preview(&self, config: &AgentConfig) -> AppResult<ConfigPreview> {
        let path = self.config_path();
        let existing = path.as_ref().map(|p| p.exists()).unwrap_or(false);
        let backup = path.as_ref().map(|p| crate::config::backup_path_for(p));
        Ok(ConfigPreview {
            agent_id: self.id().to_string(),
            agent_name: self.name().to_string(),
            provider: "KunCode".to_string(),
            base_url: config.base_url.clone(),
            model: config.model.clone(),
            masked_api_key: mask_api_key(&config.api_key),
            config_path: path.map(|p| p.to_string_lossy().to_string()),
            existing_config: existing,
            backup_path: if existing {
                backup.map(|p| format!("{}.<批次>", p.display()))
            } else {
                None
            },
            changes: {
                let mut changes = vec![
                    "写入 ANTHROPIC_BASE_URL".to_string(),
                    "写入 ANTHROPIC_AUTH_TOKEN".to_string(),
                    format!("设置默认模型为 {}", config.model),
                ];
                // Claude Code 没有多模型列表配置；额外模型在会话内用 /model 切换。
                let extra = config.effective_models();
                if extra.len() > 1 {
                    changes.push(format!(
                        "可在会话内用 /model 切换到 {} 等模型",
                        extra[1..].join("、")
                    ));
                }
                changes
            },
        })
    }

    fn configure(&self, config: &AgentConfig) -> AppResult<()> {
        let path = self
            .config_path()
            .ok_or_else(|| crate::error::AppError::Other("无法定位用户主目录".into()))?;

        write_configuration(&path, config)
    }

    fn configuration_matches(&self, config: &AgentConfig) -> AppResult<bool> {
        let Some(path) = self.config_path() else {
            return Ok(false);
        };
        let value: serde_json::Value = match std::fs::read(path) {
            Ok(body) => match serde_json::from_slice(&body) {
                Ok(value) => value,
                Err(_) => return Ok(false),
            },
            Err(_) => return Ok(false),
        };
        Ok(value
            .pointer("/env/ANTHROPIC_BASE_URL")
            .and_then(serde_json::Value::as_str)
            == Some(&config.base_url)
            && value
                .pointer("/env/ANTHROPIC_AUTH_TOKEN")
                .and_then(serde_json::Value::as_str)
                == Some(&config.api_key)
            && value
                .pointer("/env/ANTHROPIC_MODEL")
                .and_then(serde_json::Value::as_str)
                == Some(&config.model)
            && (!config.advanced.models.contains_key(&config.model)
                || (value
                    .pointer("/env/CLAUDE_CODE_EFFORT_LEVEL")
                    .and_then(serde_json::Value::as_str)
                    == config
                        .advanced
                        .models
                        .get(&config.model)
                        .and_then(|s| s.reasoning_effort.as_deref())
                    && value.get("effortLevel").and_then(serde_json::Value::as_str)
                        == config
                            .advanced
                            .models
                            .get(&config.model)
                            .and_then(|s| s.reasoning_effort.as_deref())
                    && [
                        (
                            "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
                            config
                                .advanced
                                .models
                                .get(&config.model)
                                .and_then(|s| s.max_output_tokens),
                        ),
                        (
                            "MAX_THINKING_TOKENS",
                            config
                                .advanced
                                .models
                                .get(&config.model)
                                .and_then(|s| s.thinking_budget),
                        ),
                    ]
                    .iter()
                    .all(|(key, limit)| {
                        value
                            .get("env")
                            .and_then(|env| env.get(key))
                            .and_then(serde_json::Value::as_str)
                            .map(str::to_owned)
                            == limit.map(|v| v.to_string())
                    }))))
    }

    fn launch(&self) -> AppResult<String> {
        crate::agent::launch::spawn("claude", &[])
    }
}

pub(super) fn write_configuration(path: &std::path::Path, config: &AgentConfig) -> AppResult<()> {
    let mut value = read_json_object(path)?;

    let obj = value
        .as_object_mut()
        .ok_or_else(|| crate::error::AppError::Parse("settings.json 不是对象".into()))?;

    let env = obj.entry("env").or_insert_with(|| serde_json::json!({}));
    if !env.is_object() {
        return Err(crate::error::AppError::Parse(
            "settings.json 的 env 必须是对象，原文件未修改".into(),
        ));
    }
    let env = env.as_object_mut().unwrap();
    config
        .advanced
        .validate("claude", std::slice::from_ref(&config.model))?;
    let settings = config.advanced.models.get(&config.model);
    for (key, limit) in [
        (
            "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
            settings.and_then(|s| s.max_output_tokens),
        ),
        (
            "MAX_THINKING_TOKENS",
            settings.and_then(|s| s.thinking_budget),
        ),
    ] {
        if settings.is_some() {
            env.remove(key);
        }
        if let Some(limit) = limit {
            env.insert(key.into(), serde_json::json!(limit.to_string()));
        }
    }
    env.insert(
        "ANTHROPIC_BASE_URL".into(),
        serde_json::json!(config.base_url),
    );
    env.insert(
        "ANTHROPIC_AUTH_TOKEN".into(),
        serde_json::json!(config.api_key),
    );
    env.insert("ANTHROPIC_MODEL".into(), serde_json::json!(config.model));
    let env = obj.get_mut("env").unwrap().as_object_mut().unwrap();
    if settings.is_some() {
        env.remove("CLAUDE_CODE_EFFORT_LEVEL");
    }
    if let Some(effort) = settings.and_then(|s| s.reasoning_effort.as_ref()) {
        env.insert("CLAUDE_CODE_EFFORT_LEVEL".into(), serde_json::json!(effort));
    }
    if settings.is_some() {
        obj.remove("effortLevel");
    }
    if let Some(effort) = settings.and_then(|s| s.reasoning_effort.as_ref()) {
        obj.insert("effortLevel".into(), serde_json::json!(effort));
    }

    atomic_write(path, &serde_json::to_string_pretty(&value)?)
}
