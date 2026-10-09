use std::path::PathBuf;

use super::model::{mask_api_key, AgentConfig, ConfigPreview};
use super::provider::AgentProvider;
use crate::config::{atomic_write, read_json_object};
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
                backup.map(|p| format!("{}.<批次>", p.display()))
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
        Ok(value.get("model").and_then(serde_json::Value::as_str)
            == Some(&format!("kuncode/{}", config.model))
            && value
                .pointer("/provider/kuncode/options/baseURL")
                .and_then(serde_json::Value::as_str)
                == Some(&config.base_url)
            && value
                .pointer("/provider/kuncode/options/apiKey")
                .and_then(serde_json::Value::as_str)
                == Some(&config.api_key)
            && config.effective_models().iter().all(|model| {
                value
                    .pointer("/provider/kuncode/models")
                    .and_then(|models| models.get(model))
                    .is_some_and(|actual| {
                        if config.advanced.models.contains_key(model) {
                            actual == &model_definition(config, model)
                        } else {
                            actual.is_object()
                        }
                    })
            }))
    }

    fn launch(&self) -> AppResult<String> {
        crate::agent::launch::spawn("opencode", &[])
    }
}

pub(super) fn write_configuration(path: &std::path::Path, config: &AgentConfig) -> AppResult<()> {
    let mut value = read_json_object(path)?;

    let obj = value
        .as_object_mut()
        .ok_or_else(|| crate::error::AppError::Parse("opencode.json 不是对象".into()))?;

    obj.insert(
        "model".into(),
        serde_json::json!(format!("kuncode/{}", config.model)),
    );

    let providers = obj
        .entry("provider")
        .or_insert_with(|| serde_json::json!({}));
    if !providers.is_object() {
        return Err(crate::error::AppError::Parse(
            "opencode.json 的 provider 必须是对象，原文件未修改".into(),
        ));
    }
    config
        .advanced
        .validate("opencode", &config.effective_models())?;
    let models: serde_json::Map<String, serde_json::Value> = config
        .effective_models()
        .into_iter()
        .map(|model| {
            let definition = if config.advanced.models.contains_key(&model) {
                model_definition(config, &model)
            } else {
                providers
                    .get("kuncode")
                    .and_then(|provider| provider.get("models"))
                    .and_then(|models| models.get(&model))
                    .filter(|value| value.is_object())
                    .cloned()
                    .unwrap_or_else(|| model_definition(config, &model))
            };
            (model, definition)
        })
        .collect();
    providers.as_object_mut().unwrap().insert(
        "kuncode".into(),
        serde_json::json!({
            "npm": "@ai-sdk/openai-compatible",
            "name": "KunCode",
            "options": {
                "baseURL": config.base_url,
                "apiKey": config.api_key,
            },
            "models": models,
        }),
    );

    atomic_write(path, &serde_json::to_string_pretty(&value)?)
}

pub(super) fn model_definition(config: &AgentConfig, model: &str) -> serde_json::Value {
    let mut value = serde_json::json!({"name": model});
    if let Some(settings) = config.advanced.models.get(model) {
        let obj = value.as_object_mut().unwrap();
        if let Some(name) = &settings.name {
            obj.insert("name".into(), serde_json::json!(name));
        }
        if let Some(image) = settings.image_input {
            let input = if image {
                vec!["text", "image"]
            } else {
                vec!["text"]
            };
            obj.insert(
                "modalities".into(),
                serde_json::json!({"input": input, "output": ["text"]}),
            );
            obj.insert("attachment".into(), serde_json::json!(image));
        }
        if let Some(reasoning) = settings.reasoning {
            obj.insert("reasoning".into(), serde_json::json!(reasoning));
        }
        if let (Some(context), Some(output)) = (settings.context_window, settings.max_output_tokens)
        {
            obj.insert(
                "limit".into(),
                serde_json::json!({"context": context, "output": output}),
            );
        }
        let mut options = settings.options.clone().unwrap_or_default();
        if let Some(effort) = &settings.reasoning_effort {
            options.insert("reasoningEffort".into(), serde_json::json!(effort));
        }
        if !options.is_empty() {
            obj.insert("options".into(), serde_json::Value::Object(options));
        }
        let mut variants = settings.variants.clone().unwrap_or_default();
        for effort in &settings.reasoning_efforts {
            let variant = variants.entry(effort.clone()).or_default();
            variant.insert("reasoningEffort".into(), serde_json::json!(effort));
            variant.insert("disabled".into(), serde_json::json!(false));
        }
        if !variants.is_empty() {
            obj.insert("variants".into(), serde_json::json!(variants));
        }
    }
    value
}
