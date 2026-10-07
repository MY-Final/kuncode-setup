use std::path::PathBuf;

use super::model::{mask_api_key, AgentConfig, ConfigPreview, TestResult};
use super::provider::AgentProvider;
use crate::config::{backup_file, ensure_parent};
use crate::env::{detect_cli, ToolStatus};
use crate::error::AppResult;

pub struct OpenCodeProvider;

impl OpenCodeProvider {
    fn config_path_inner(&self) -> Option<PathBuf> {
        // OpenCode 用户级配置目录：~/.config/opencode/opencode.json
        dirs::home_dir().map(|h| h.join(".config").join("opencode").join("opencode.json"))
    }
}

impl AgentProvider for OpenCodeProvider {
    fn id(&self) -> &'static str {
        "opencode"
    }

    fn name(&self) -> &'static str {
        "OpenCode"
    }

    fn description(&self) -> &'static str {
        "开源 AI Coding Agent"
    }

    fn detect(&self) -> ToolStatus {
        detect_cli("opencode", "OpenCode", "opencode", &["--version"])
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
                backup.map(|p| p.to_string_lossy().to_string())
            } else {
                None
            },
            changes: vec![
                "写入 KunCode Provider".to_string(),
                format!("设置默认模型为 {}", config.model),
                "保存 API Key".to_string(),
            ],
        })
    }

    fn backup(&self) -> AppResult<Option<PathBuf>> {
        match self.config_path() {
            Some(path) => backup_file(&path),
            None => Ok(None),
        }
    }

    fn configure(&self, config: &AgentConfig) -> AppResult<()> {
        let path = self
            .config_path()
            .ok_or_else(|| crate::error::AppError::Other("无法定位用户主目录".into()))?;

        let mut value: serde_json::Value = match std::fs::read_to_string(&path) {
            Ok(text) if !text.trim().is_empty() => {
                serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({}))
            }
            _ => serde_json::json!({}),
        };

        let obj = value
            .as_object_mut()
            .ok_or_else(|| crate::error::AppError::Parse("opencode.json 不是对象".into()))?;

        obj.insert("model".into(), serde_json::json!(config.model));

        let providers = obj
            .entry("provider")
            .or_insert_with(|| serde_json::json!({}));
        if !providers.is_object() {
            *providers = serde_json::json!({});
        }
        providers.as_object_mut().unwrap().insert(
            "kuncode".into(),
            serde_json::json!({
                "npm": "@ai-sdk/openai-compatible",
                "name": "KunCode",
                "options": {
                    "baseURL": config.base_url,
                    "apiKey": config.api_key,
                },
                "models": {
                    config.model.clone(): { "name": config.model.clone() }
                }
            }),
        );

        ensure_parent(&path)?;
        std::fs::write(&path, serde_json::to_string_pretty(&value)?)?;
        Ok(())
    }

    fn test(&self, config: &AgentConfig) -> TestResult {
        crate::agent::http_test::probe(&config.base_url, &config.api_key, &config.model)
    }

    fn launch(&self) -> AppResult<String> {
        crate::agent::launch::spawn("opencode", &[])
    }
}
