use std::path::PathBuf;

use serde_json::json;

use super::model::{mask_api_key, AgentConfig, ConfigPreview};
use super::provider::AgentProvider;
use crate::config::{atomic_write, backup_file};
use crate::env::{detect_cli, ToolStatus};
use crate::error::AppResult;

pub struct CodexProvider;

impl CodexProvider {
    fn home_dir(&self) -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(".codex"))
    }
}

impl AgentProvider for CodexProvider {
    fn id(&self) -> &'static str {
        "codex"
    }

    fn name(&self) -> &'static str {
        "Codex"
    }

    fn description(&self) -> &'static str {
        "OpenAI 官方 AI 编程助手"
    }

    fn detect(&self) -> ToolStatus {
        detect_cli("codex", "Codex", "codex", &["--version"])
    }

    fn config_path(&self) -> Option<PathBuf> {
        self.home_dir().map(|d| d.join("config.toml"))
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
                "写入 KunCode Provider 配置".to_string(),
                format!("设置默认模型为 {}", config.model),
                "保存 API Key 到 Codex 凭据文件".to_string(),
            ],
        })
    }

    fn backup(&self) -> AppResult<Option<PathBuf>> {
        if let Some(dir) = self.home_dir() {
            backup_file(&dir.join("auth.json"))?;
        }
        match self.config_path() {
            Some(path) => backup_file(&path),
            None => Ok(None),
        }
    }

    fn configure(&self, config: &AgentConfig) -> AppResult<()> {
        let dir = self
            .home_dir()
            .ok_or_else(|| crate::error::AppError::Other("无法定位用户主目录".into()))?;
        write_configuration(&dir, config)
    }

    fn configuration_paths(&self) -> Vec<PathBuf> {
        self.home_dir()
            .map(|dir| vec![dir.join("config.toml"), dir.join("auth.json")])
            .unwrap_or_default()
    }

    fn configuration_matches(&self, config: &AgentConfig) -> AppResult<bool> {
        let Some(dir) = self.home_dir() else {
            return Ok(false);
        };
        let value: toml::Value = match std::fs::read_to_string(dir.join("config.toml")) {
            Ok(text) => match toml::from_str(&text) {
                Ok(value) => value,
                Err(_) => return Ok(false),
            },
            Err(_) => return Ok(false),
        };
        let auth: serde_json::Value = match std::fs::read(dir.join("auth.json")) {
            Ok(body) => match serde_json::from_slice(&body) {
                Ok(value) => value,
                Err(_) => return Ok(false),
            },
            Err(_) => return Ok(false),
        };
        Ok(
            value.get("model").and_then(toml::Value::as_str) == Some(&config.model)
                && value.get("model_provider").and_then(toml::Value::as_str) == Some("kuncode")
                && value
                    .get("model_providers")
                    .and_then(|providers| providers.get("kuncode"))
                    .and_then(|provider| provider.get("base_url"))
                    .and_then(toml::Value::as_str)
                    == Some(&config.base_url)
                && auth
                    .get("OPENAI_API_KEY")
                    .and_then(serde_json::Value::as_str)
                    == Some(&config.api_key),
        )
    }

    fn launch(&self) -> AppResult<String> {
        crate::agent::launch::spawn("codex", &[])
    }
}

pub(super) fn write_configuration(dir: &std::path::Path, config: &AgentConfig) -> AppResult<()> {
    let path = dir.join("config.toml");
    let mut value: toml::Value = match std::fs::read_to_string(&path) {
        Ok(text) => {
            toml::from_str(&text).unwrap_or_else(|_| toml::Value::Table(Default::default()))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            toml::Value::Table(Default::default())
        }
        Err(error) => return Err(error.into()),
    };
    let table = value
        .as_table_mut()
        .ok_or_else(|| crate::error::AppError::Parse("Codex 配置不是对象".into()))?;
    table.insert("model".into(), config.model.clone().into());
    table.insert("model_provider".into(), "kuncode".into());
    let providers = table
        .entry("model_providers")
        .or_insert_with(|| toml::Value::Table(Default::default()));
    let providers = providers
        .as_table_mut()
        .ok_or_else(|| crate::error::AppError::Parse("Codex Provider 配置损坏".into()))?;
    let mut provider = toml::Table::new();
    provider.insert("name".into(), "KunCode".into());
    provider.insert("base_url".into(), config.base_url.clone().into());
    provider.insert("wire_api".into(), "responses".into());
    provider.insert("requires_openai_auth".into(), true.into());
    providers.insert("kuncode".into(), toml::Value::Table(provider));

    // Codex has no native multi-model list, so each extra model becomes a
    // profile the user can select with `codex --profile <name>`.
    let models = config.effective_models();
    let profiles = table
        .entry("profiles")
        .or_insert_with(|| toml::Value::Table(Default::default()));
    let profiles = profiles
        .as_table_mut()
        .ok_or_else(|| crate::error::AppError::Parse("Codex profiles 配置损坏".into()))?;
    for (index, model) in models.iter().enumerate() {
        let mut profile = toml::Table::new();
        profile.insert("model".into(), model.clone().into());
        profile.insert("model_provider".into(), "kuncode".into());
        profiles.insert(
            format!("kuncode-{}", index + 1),
            toml::Value::Table(profile),
        );
    }
    let body = toml::to_string_pretty(&value)
        .map_err(|_| crate::error::AppError::Parse("无法生成 Codex 配置".into()))?;
    atomic_write(&path, &body)?;
    merge_auth_key(&dir.join("auth.json"), &config.api_key)
}

/// Merges the API key into `auth.json` without dropping other keys, so an
/// existing ChatGPT login (`tokens`) is preserved.
fn merge_auth_key(path: &std::path::Path, api_key: &str) -> AppResult<()> {
    let mut value: serde_json::Value = match std::fs::read_to_string(path) {
        Ok(text) if !text.trim().is_empty() => {
            serde_json::from_str(&text).unwrap_or_else(|_| json!({}))
        }
        _ => json!({}),
    };
    let object = value
        .as_object_mut()
        .ok_or_else(|| crate::error::AppError::Parse("auth.json 不是对象".into()))?;
    object.insert("OPENAI_API_KEY".into(), json!(api_key));
    atomic_write(path, &serde_json::to_string_pretty(&value)?)
}
