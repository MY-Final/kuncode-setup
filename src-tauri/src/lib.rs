mod agent;
mod config;
mod env;
mod error;

use tauri::Manager;

use agent::model::{AgentConfig, ConfigPreview, StepResult, TestResult};
use env::EnvironmentReport;

#[tauri::command]
fn detect_environment() -> EnvironmentReport {
    EnvironmentReport {
        os: env::detect::detect_os(),
        arch: env::detect::detect_arch(),
        tools: env::detect::detect_common(),
    }
}

#[tauri::command]
fn list_agents() -> Vec<agent::AgentMeta> {
    agent::list_meta()
}

#[tauri::command]
fn preview_config(
    agent_id: String,
    config: AgentConfig,
) -> Result<ConfigPreview, error::ErrorPayload> {
    let provider = agent::get(&agent_id).map_err(error::ErrorPayload::from)?;
    provider.preview(&config).map_err(error::ErrorPayload::from)
}

/// 备份 + 写入配置，逐步返回每一步的结果。
#[tauri::command]
fn apply_config(
    agent_id: String,
    config: AgentConfig,
) -> Result<Vec<StepResult>, error::ErrorPayload> {
    let provider = agent::get(&agent_id).map_err(error::ErrorPayload::from)?;
    let mut steps = vec![];

    let status = provider.detect();
    steps.push(StepResult {
        step: format!("检查 {}", provider.name()),
        ok: status.installed,
        detail: status.version.clone(),
    });

    let backup = provider.backup().map_err(error::ErrorPayload::from)?;
    steps.push(StepResult {
        step: "备份原配置".to_string(),
        ok: true,
        detail: backup.map(|p| p.to_string_lossy().to_string()),
    });

    match provider.configure(&config) {
        Ok(()) => steps.push(StepResult {
            step: "写入配置".to_string(),
            ok: true,
            detail: None,
        }),
        Err(e) => {
            let payload = error::ErrorPayload::from(e);
            steps.push(StepResult {
                step: "写入配置".to_string(),
                ok: false,
                detail: Some(payload.message),
            });
            return Ok(steps);
        }
    }

    let test = provider.test(&config);
    steps.push(StepResult {
        step: "测试连接".to_string(),
        ok: test.ok,
        detail: Some(test.message),
    });

    Ok(steps)
}

#[tauri::command]
fn test_connection(
    agent_id: String,
    config: AgentConfig,
) -> Result<TestResult, error::ErrorPayload> {
    let provider = agent::get(&agent_id).map_err(error::ErrorPayload::from)?;
    Ok(provider.test(&config))
}

#[tauri::command]
fn launch_agent(agent_id: String) -> Result<String, error::ErrorPayload> {
    let provider = agent::get(&agent_id).map_err(error::ErrorPayload::from)?;
    provider.launch().map_err(error::ErrorPayload::from)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            detect_environment,
            list_agents,
            preview_config,
            apply_config,
            test_connection,
            launch_agent,
        ])
        .setup(|app| {
            let _ = app.get_webview_window("main");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
