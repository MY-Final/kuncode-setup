use std::path::PathBuf;

use serde_json::json;

use super::model::{mask_api_key, AgentConfig, ConfigPreview, TestResult};
use super::provider::AgentProvider;
use crate::config::{backup_file, ensure_parent};
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
        match self.config_path() {
            Some(path) => backup_file(&path),
            None => Ok(None),
        }
    }

    fn configure(&self, config: &AgentConfig) -> AppResult<()> {
        let dir = self
            .home_dir()
            .ok_or_else(|| crate::error::AppError::Other("无法定位用户主目录".into()))?;
        let config_path = dir.join("config.toml");

        let body = format!(
            "# 由 KunCode Setup 自动生成 / 更新\n\
             model = \"{model}\"\n\
             model_provider = \"kuncode\"\n\n\
             [model_providers.kuncode]\n\
             name = \"KunCode\"\n\
             base_url = \"{base_url}\"\n\
             env_key = \"OPENAI_API_KEY\"\n\
             wire_api = \"chat\"\n",
            model = config.model,
            base_url = config.base_url,
        );

        ensure_parent(&config_path)?;
        std::fs::write(&config_path, body)?;

        // 将 API Key 写入 Codex 的凭据文件，权限交由系统。
        let auth_path = dir.join("auth.json");
        let auth = json!({ "OPENAI_API_KEY": config.api_key });
        std::fs::write(&auth_path, serde_json::to_string_pretty(&auth)?)?;

        Ok(())
    }

    fn test(&self, config: &AgentConfig) -> TestResult {
        crate::agent::http_test::probe(&config.base_url, &config.api_key, &config.model)
    }

    fn launch(&self) -> AppResult<String> {
        crate::agent::launch::spawn("codex", &[])
    }
}
