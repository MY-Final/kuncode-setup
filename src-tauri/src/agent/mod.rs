pub mod claude;
pub mod codex;
pub mod http_test;
pub mod launch;
pub mod model;
pub mod opencode;
pub mod provider;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use provider::AgentProvider;

/// 前端用于展示的 Agent 元信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMeta {
    pub id: String,
    pub name: String,
    pub description: String,
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

/// 所有已知 Provider 的注册表（注册顺序即展示顺序）。
pub fn all() -> Vec<Box<dyn AgentProvider>> {
    vec![
        Box::new(codex::CodexProvider),
        Box::new(claude::ClaudeCodeProvider),
        Box::new(opencode::OpenCodeProvider),
    ]
}

/// 按 id 查找 Provider。
pub fn get(id: &str) -> AppResult<Box<dyn AgentProvider>> {
    all()
        .into_iter()
        .find(|p| p.id() == id)
        .ok_or_else(|| AppError::NotFound(format!("Agent「{id}」")))
}

/// 返回所有 Agent 的元信息（含检测结果）。
pub fn list_meta() -> Vec<AgentMeta> {
    all()
        .into_iter()
        .map(|p| {
            let status = p.detect();
            AgentMeta {
                id: p.id().to_string(),
                name: p.name().to_string(),
                description: p.description().to_string(),
                installed: status.installed,
                version: status.version,
                path: status.path,
            }
        })
        .collect()
}
