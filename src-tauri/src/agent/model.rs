use serde::{Deserialize, Serialize};

/// 统一的 Agent 配置模型。
/// 前端「不应该」出现大量 if codex / if claude / if opencode，
/// 所有差异都由各 Provider 在 Rust 层消化。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub agent_id: String,
    pub model: String,
    pub base_url: String,
    /// 明文 API Key，只在内存 / 安全存储中出现，禁止写入日志。
    pub api_key: String,
}

/// 即将写入的配置预览（API Key 已掩码）。
#[derive(Debug, Clone, Serialize, Deserialize)]
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

/// 配置执行阶段的结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepResult {
    pub step: String,
    pub ok: bool,
    pub detail: Option<String>,
}

/// 连通性测试结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
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
