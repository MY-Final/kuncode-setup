use crate::agent::model::{AgentConfig, ConfigPreview};
use crate::env::ToolStatus;
use crate::error::AppResult;

/// 所有 Agent Provider 必须实现的统一接口。
/// 新增 Agent（Cursor / Gemini CLI ...）时只需实现该 trait。
pub trait AgentProvider {
    /// 稳定 id，例如 "codex"。
    fn id(&self) -> &'static str;

    /// 展示名称，例如 "Codex"。
    fn name(&self) -> &'static str;

    /// 一句话描述。
    fn description(&self) -> &'static str;

    /// 检测是否安装。
    fn detect(&self) -> ToolStatus;

    /// 用户级配置文件路径（MVP 只操作用户级配置）。
    fn config_path(&self) -> Option<std::path::PathBuf>;

    /// 读取现有配置（原始文本，便于预览 / 备份）。
    #[allow(dead_code)]
    fn get_config(&self) -> AppResult<Option<String>>;

    /// 生成写入前的预览信息（不含明文 Key）。
    fn preview(&self, config: &AgentConfig) -> AppResult<ConfigPreview>;

    /// Validate every existing member before obtaining a key or writing files.
    fn validate_existing(&self) -> AppResult<()> {
        for path in self.configuration_paths() {
            if path
                .extension()
                .is_some_and(|extension| extension == "toml")
            {
                let value = crate::config::read_toml_table(&path)?;
                for field in ["model_providers", "profiles"] {
                    if value.get(field).is_some_and(|item| !item.is_table()) {
                        return Err(crate::error::AppError::Parse(format!(
                            "{} 的 {field} 必须是对象",
                            path.display()
                        )));
                    }
                }
            } else {
                let value = crate::config::read_json_object(&path)?;
                for field in ["env", "provider"] {
                    if value.get(field).is_some_and(|item| !item.is_object()) {
                        return Err(crate::error::AppError::Parse(format!(
                            "{} 的 {field} 必须是对象",
                            path.display()
                        )));
                    }
                }
            }
        }
        Ok(())
    }

    /// 写入配置。
    fn configure(&self, config: &AgentConfig) -> AppResult<()>;

    fn configuration_matches(&self, config: &AgentConfig) -> AppResult<bool>;

    fn configuration_paths(&self) -> Vec<std::path::PathBuf> {
        self.config_path().into_iter().collect()
    }

    /// 启动 Agent。
    fn launch(&self) -> AppResult<String>;
}
