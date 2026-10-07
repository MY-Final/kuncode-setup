pub mod detect;

pub use detect::detect_cli;

use serde::{Deserialize, Serialize};

/// 单个环境检测项的通用结构。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    /// 检测项 id，例如 "node" / "git" / "codex"
    pub id: String,
    /// 展示名称
    pub name: String,
    /// 是否已安装 / 可用
    pub installed: bool,
    /// 版本号（可能为空）
    pub version: Option<String>,
    /// 可执行文件路径（可能为空）
    pub path: Option<String>,
}

/// 完整的环境检测报告。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentReport {
    pub os: String,
    pub arch: String,
    pub tools: Vec<ToolStatus>,
}

impl ToolStatus {
    pub fn missing(id: &str, name: &str) -> Self {
        ToolStatus {
            id: id.to_string(),
            name: name.to_string(),
            installed: false,
            version: None,
            path: None,
        }
    }
}
