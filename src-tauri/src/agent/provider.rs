use crate::agent::model::{AgentConfig, ConfigPreview, TestResult};
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

    /// 备份原配置，返回备份路径。
    fn backup(&self) -> AppResult<Option<std::path::PathBuf>>;

    /// 写入配置。
    fn configure(&self, config: &AgentConfig) -> AppResult<()>;

    /// 测试连通性。
    fn test(&self, config: &AgentConfig) -> TestResult;

    /// 启动 Agent。
    fn launch(&self) -> AppResult<String>;
}
