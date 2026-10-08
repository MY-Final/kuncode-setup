mod agent;
mod config;
mod connections;
mod env;
mod error;

use connections::{
    AccountProfile, ConfigurationOutcome, ConnectionService, ConnectionSnapshot, ConnectionStep,
    ConnectionSummary, ImportConnection,
};
use error::{AppError, AppResult, ErrorPayload};
use std::sync::Arc;
use tauri::{ipc::Channel, Manager, State};

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> Result<T, ErrorPayload> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| ErrorPayload::from(AppError::Other("操作未完成，请重试".into())))?
        .map_err(ErrorPayload::from)
}

#[tauri::command]
async fn detect_environment() -> Result<env::EnvironmentReport, ErrorPayload> {
    blocking(|| {
        Ok(env::EnvironmentReport {
            os: env::detect::detect_os(),
            arch: env::detect::detect_arch(),
            tools: env::detect::detect_common(),
        })
    })
    .await
}

#[tauri::command]
async fn list_agents() -> Result<Vec<agent::AgentMeta>, ErrorPayload> {
    blocking(|| Ok(agent::list_meta())).await
}

#[tauri::command]
async fn list_connections(
    service: State<'_, Arc<ConnectionService>>,
) -> Result<ConnectionSnapshot, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.snapshot()).await
}

#[tauri::command]
async fn set_authorization_site(
    service: State<'_, Arc<ConnectionService>>,
    site: String,
) -> Result<ConnectionSnapshot, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.set_authorization_site(&site)).await
}

#[tauri::command]
async fn start_login(
    app: tauri::AppHandle,
    service: State<'_, Arc<ConnectionService>>,
    attempt_id: String,
    progress: Channel<ConnectionStep>,
) -> Result<ConnectionSummary, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.login(&app, &attempt_id, &progress)).await
}

#[tauri::command]
fn cancel_login(
    service: State<'_, Arc<ConnectionService>>,
    attempt_id: String,
) -> Result<(), ErrorPayload> {
    service
        .cancel_login(&attempt_id)
        .map_err(ErrorPayload::from)
}

#[tauri::command]
async fn import_connection(
    service: State<'_, Arc<ConnectionService>>,
    input: ImportConnection,
) -> Result<ConnectionSummary, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.import(input)).await
}

#[tauri::command]
async fn connection_models(
    service: State<'_, Arc<ConnectionService>>,
    connection_id: String,
) -> Result<Vec<String>, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.models(&connection_id)).await
}

#[tauri::command]
async fn connection_profile(
    service: State<'_, Arc<ConnectionService>>,
    connection_id: String,
) -> Result<AccountProfile, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.profile(&connection_id)).await
}
#[tauri::command]
async fn logout_connection(
    service: State<'_, Arc<ConnectionService>>,
    connection_id: String,
) -> Result<Option<String>, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.logout(&connection_id)).await
}

#[tauri::command]
async fn list_site_tokens(
    service: State<'_, Arc<ConnectionService>>,
    connection_id: String,
) -> Result<Vec<connections::http::SiteToken>, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.site_tokens(&connection_id)).await
}

#[tauri::command]
async fn site_groups(
    service: State<'_, Arc<ConnectionService>>,
    connection_id: String,
) -> Result<Vec<connections::http::SiteGroup>, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.site_groups(&connection_id)).await
}

#[tauri::command]
async fn group_models(
    service: State<'_, Arc<ConnectionService>>,
    connection_id: String,
    group: String,
) -> Result<Vec<String>, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.site_group_models(&connection_id, &group)).await
}

#[tauri::command]
async fn create_site_token(
    service: State<'_, Arc<ConnectionService>>,
    connection_id: String,
    name: String,
    group: String,
    model_limits: Vec<String>,
) -> Result<i64, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.create_site_token(&connection_id, &name, &group, &model_limits)).await
}

#[tauri::command]
async fn update_site_token(
    service: State<'_, Arc<ConnectionService>>,
    connection_id: String,
    token_id: i64,
    name: String,
    group: String,
    model_limits: Vec<String>,
) -> Result<(), ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || {
        service.update_site_token(&connection_id, token_id, &name, &group, &model_limits)
    })
    .await
}

#[tauri::command]
async fn delete_site_token(
    service: State<'_, Arc<ConnectionService>>,
    connection_id: String,
    token_id: i64,
) -> Result<(), ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.delete_site_token(&connection_id, token_id)).await
}

#[tauri::command]
async fn preview_connection_config(
    service: State<'_, Arc<ConnectionService>>,
    connection_id: String,
    agent_id: String,
    model: String,
    models: Option<Vec<String>>,
) -> Result<agent::model::ConfigPreview, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || {
        service.preview(
            &connection_id,
            &agent_id,
            &model,
            &models.unwrap_or_default(),
        )
    })
    .await
}

#[tauri::command]
async fn apply_connection_config(
    service: State<'_, Arc<ConnectionService>>,
    connection_id: String,
    agent_id: String,
    selection: connections::ApplySelection,
    progress: Channel<ConnectionStep>,
) -> Result<ConfigurationOutcome, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.apply(&connection_id, &agent_id, selection, Some(&progress))).await
}

#[tauri::command]
async fn check_tool_connection(
    service: State<'_, Arc<ConnectionService>>,
    agent_id: String,
) -> Result<connections::BindingCheck, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.check_binding(&agent_id)).await
}

#[tauri::command]
async fn restore_tool_config(
    service: State<'_, Arc<ConnectionService>>,
    agent_id: String,
) -> Result<connections::RestoreOutcome, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.restore_agent(&agent_id)).await
}

#[tauri::command]
async fn probe_tool_connection(
    service: State<'_, Arc<ConnectionService>>,
    agent_id: String,
) -> Result<agent::model::TestResult, ErrorPayload> {
    let service = service.inner().clone();
    blocking(move || service.probe_binding(&agent_id)).await
}

#[tauri::command]
async fn launch_agent(agent_id: String) -> Result<String, ErrorPayload> {
    blocking(move || agent::get(&agent_id)?.launch()).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            detect_environment,
            list_agents,
            list_connections,
            set_authorization_site,
            start_login,
            cancel_login,
            import_connection,
            connection_models,
            connection_profile,
            logout_connection,
            list_site_tokens,
            site_groups,
            group_models,
            create_site_token,
            update_site_token,
            delete_site_token,
            preview_connection_config,
            apply_connection_config,
            probe_tool_connection,
            check_tool_connection,
            restore_tool_config,
            launch_agent
        ])
        .setup(|app| {
            let service = ConnectionService::new(app.path().app_data_dir()?)?;
            app.manage(Arc::new(service));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
