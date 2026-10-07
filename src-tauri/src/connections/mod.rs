pub mod http;
pub mod login;
#[cfg(test)]
mod tests;
mod vault;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{atomic::AtomicBool, Arc, Mutex};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::ipc::Channel;
use uuid::Uuid;

use crate::agent::model::{AgentConfig, ConfigPreview, TestResult};
use crate::error::{AppError, AppResult};
use http::{normalize_url, SiteClient, KUNCODE_SITE};

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionKind {
    KuncodeAuthorized,
    NewapiPat,
    ApiKey,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionSummary {
    pub id: String,
    pub kind: ConnectionKind,
    pub site_url: String,
    pub api_base_url: String,
    pub account: Option<String>,
    pub user_id: Option<i64>,
    pub legacy_user_id: Option<i64>,
    pub expires_at: Option<i64>,
    pub connected: bool,
    pub verified: bool,
}

impl ConnectionSummary {
    fn credential_reference(&self) -> String {
        vault::reference(
            "connection",
            &format!("{}/{}", self.id, self.user_id.unwrap_or(0)),
            if self.kind == ConnectionKind::ApiKey {
                &self.api_base_url
            } else {
                &self.site_url
            },
        )
    }
    fn tool_reference(&self, agent: &str) -> String {
        vault::reference(
            "tool",
            &format!("{}/{}/{agent}", self.id, self.user_id.unwrap_or(0)),
            &self.api_base_url,
        )
    }
    fn validate(&self) -> AppResult<()> {
        normalize_url(&self.site_url)?;
        normalize_url(&self.api_base_url)?;
        if reqwest::Url::parse(&self.site_url).unwrap().origin()
            != reqwest::Url::parse(&self.api_base_url).unwrap().origin()
        {
            return Err(AppError::Auth(
                "站点和模型服务不属于同一地址，请重新连接".into(),
            ));
        }
        if self.kind == ConnectionKind::KuncodeAuthorized
            && self.api_base_url != format!("{}/v1", self.site_url)
        {
            return Err(AppError::Auth("KunCode 连接地址不匹配，请重新授权".into()));
        }
        Ok(())
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolBinding {
    pub agent_id: String,
    pub connection_id: String,
    pub model: String,
    pub token_id: Option<i64>,
    pub status: String,
    pub verified: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalState {
    pub installation_id: String,
    #[serde(default = "default_authorization_site")]
    pub authorization_site: String,
    pub current_official: Option<String>,
    pub connections: Vec<ConnectionSummary>,
    pub bindings: HashMap<String, ToolBinding>,
    pub tool_keys: HashMap<String, Option<i64>>,
    #[serde(default)]
    pub pending_keys: HashMap<String, String>,
}

fn default_authorization_site() -> String {
    KUNCODE_SITE.into()
}

impl Default for LocalState {
    fn default() -> Self {
        Self {
            installation_id: Uuid::new_v4().to_string(),
            authorization_site: default_authorization_site(),
            current_official: None,
            connections: Vec::new(),
            bindings: HashMap::new(),
            tool_keys: HashMap::new(),
            pending_keys: HashMap::new(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionSnapshot {
    pub authorization_site: String,
    pub current_official: Option<String>,
    pub connections: Vec<ConnectionSummary>,
    pub bindings: HashMap<String, ToolBinding>,
}

pub struct ConnectionService {
    state: Mutex<LocalState>,
    directory: PathBuf,
    pub attempt: Mutex<Option<(String, Arc<AtomicBool>)>>,
    cancelled_attempts: Mutex<Vec<String>>,
    operation: Mutex<()>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportConnection {
    pub kind: ConnectionKind,
    pub site_url: String,
    pub api_base_url: Option<String>,
    pub credential: String,
    pub user_id: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStep {
    pub step: String,
    pub status: String,
    pub detail: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationOutcome {
    pub binding: ToolBinding,
    pub steps: Vec<ConnectionStep>,
}

impl ConnectionService {
    pub fn new(directory: PathBuf) -> AppResult<Self> {
        std::fs::create_dir_all(&directory)?;
        let path = directory.join("connections.json");
        let state = if path.exists() {
            serde_json::from_slice(&std::fs::read(path)?)
                .map_err(|_| AppError::Other("本机连接信息无法读取，请检查应用数据文件".into()))?
        } else {
            LocalState::default()
        };
        let service = Self {
            state: Mutex::new(state),
            directory,
            attempt: Mutex::new(None),
            cancelled_attempts: Mutex::new(Vec::new()),
            operation: Mutex::new(()),
        };
        {
            let state = service
                .state
                .lock()
                .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
            service.save(&state)?;
        }
        Ok(service)
    }

    fn save(&self, state: &LocalState) -> AppResult<()> {
        let path = self.directory.join("connections.json");
        let temporary = self.directory.join("connections.tmp");
        std::fs::write(&temporary, serde_json::to_vec_pretty(state)?)?;
        std::fs::rename(temporary, path)?;
        Ok(())
    }

    pub fn installation_id(&self) -> AppResult<String> {
        Ok(self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?
            .installation_id
            .clone())
    }

    pub fn authorization_site(&self) -> AppResult<String> {
        let state = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
        normalize_url(&state.authorization_site)
    }

    pub fn set_authorization_site(&self, site: &str) -> AppResult<ConnectionSnapshot> {
        let site = normalize_url(site)?;
        // Login captures a destination once. Keep address changes out of an active attempt.
        let attempt = self
            .attempt
            .lock()
            .map_err(|_| AppError::Other("登录状态暂不可用".into()))?;
        if attempt.is_some() {
            return Err(AppError::Other(
                "请先完成或取消当前登录，再修改授权服务地址".into(),
            ));
        }
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
            let previous = std::mem::replace(&mut state.authorization_site, site);
            if let Err(error) = self.save(&state) {
                state.authorization_site = previous;
                return Err(error);
            }
        }
        self.snapshot()
    }

    pub fn snapshot(&self) -> AppResult<ConnectionSnapshot> {
        let state = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
        let mut connections = state.connections.clone();
        for connection in &mut connections {
            if connection
                .expires_at
                .is_some_and(|expiry| expiry <= chrono::Utc::now().timestamp())
            {
                connection.connected = false;
            }
        }
        Ok(ConnectionSnapshot {
            authorization_site: state.authorization_site.clone(),
            current_official: state.current_official.clone(),
            connections,
            bindings: state.bindings.clone(),
        })
    }

    fn connection(&self, id: &str) -> AppResult<ConnectionSummary> {
        let state = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
        let connection = state
            .connections
            .iter()
            .find(|item| item.id == id)
            .cloned()
            .ok_or_else(|| AppError::Auth("请选择或重新连接站点".into()))?;
        connection.validate()?;
        Ok(connection)
    }

    pub fn store_connection(
        &self,
        mut connection: ConnectionSummary,
        secret: &str,
    ) -> AppResult<ConnectionSummary> {
        connection.validate()?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
        if connection.kind != ConnectionKind::ApiKey {
            if let Some(existing) = state.connections.iter().find(|item| {
                item.kind == connection.kind
                    && item.site_url == connection.site_url
                    && item.user_id == connection.user_id
            }) {
                connection.id = existing.id.clone();
            }
        }
        vault::put(&connection.credential_reference(), secret)?;
        if connection.kind == ConnectionKind::KuncodeAuthorized {
            state.current_official = Some(connection.id.clone());
        }
        state.connections.retain(|item| item.id != connection.id);
        state.connections.push(connection.clone());
        self.save(&state)?;
        Ok(connection)
    }

    pub fn import(&self, input: ImportConnection) -> AppResult<ConnectionSummary> {
        if input.kind == ConnectionKind::KuncodeAuthorized {
            return Err(AppError::Auth("请通过浏览器授权登录 KunCode".into()));
        }
        if input.credential.trim().is_empty()
            || input.credential.contains(['\r', '\n'])
            || input.user_id.is_some_and(|id| id <= 0)
        {
            return Err(AppError::Auth("请提供有效凭据和用户 ID".into()));
        }
        let site = normalize_url(&input.site_url)?;
        let api_base = normalize_url(
            input
                .api_base_url
                .as_deref()
                .unwrap_or(&format!("{site}/v1")),
        )?;
        if reqwest::Url::parse(&site).unwrap().origin()
            != reqwest::Url::parse(&api_base).unwrap().origin()
        {
            return Err(AppError::Auth(
                "模型服务地址必须与站点同域，凭据不会跨站点发送".into(),
            ));
        }
        let secret = input.credential.trim();
        let client = SiteClient::new()?;
        let mut connection = ConnectionSummary {
            id: Uuid::new_v4().to_string(),
            kind: input.kind,
            site_url: site,
            api_base_url: api_base,
            account: None,
            user_id: None,
            legacy_user_id: input.user_id,
            expires_at: None,
            connected: true,
            verified: false,
        };
        if connection.kind == ConnectionKind::NewapiPat {
            let profile =
                client.profile(&connection.site_url, secret, connection.legacy_user_id)?;
            connection.user_id = profile.get("id").and_then(Value::as_i64);
            connection.account = profile
                .get("display_name")
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
                .or_else(|| profile.get("username").and_then(Value::as_str))
                .map(str::to_owned);
            connection.verified = true;
        } else {
            match client.models(&connection.api_base_url, secret, None, false, None) {
                Ok(_) => connection.verified = true,
                Err(AppError::Unsupported(_)) => {}
                Err(error) => return Err(error),
            }
        }
        self.store_connection(connection, secret)
    }

    pub fn models(&self, id: &str) -> AppResult<Vec<String>> {
        let connection = self.connection(id)?;
        let secret = vault::get(&connection.credential_reference())?;
        let client = SiteClient::new()?;
        if connection.kind == ConnectionKind::ApiKey {
            return client.models(&connection.api_base_url, &secret, None, false, None);
        }
        let profile = client.profile(&connection.site_url, &secret, connection.legacy_user_id)?;
        let group = if connection.kind == ConnectionKind::KuncodeAuthorized {
            profile.get("group").and_then(Value::as_str)
        } else {
            None
        };
        client.models(
            &connection.site_url,
            &secret,
            connection.legacy_user_id,
            true,
            group,
        )
    }

    pub fn logout(&self, id: &str) -> AppResult<Option<String>> {
        let connection = self.connection(id)?;
        let warning = if connection.kind == ConnectionKind::KuncodeAuthorized {
            match vault::get(&connection.credential_reference()).and_then(|token| {
                SiteClient::new()?.request(
                    reqwest::Method::POST,
                    &format!("{}/api/desktop/auth/logout", connection.site_url),
                    Some(&token),
                    None,
                    None,
                )
            }) {
                Ok(_) => None,
                Err(_) => {
                    Some("本机已退出，远端撤销尚未完成；可在 KunCode 网站撤销本次授权".into())
                }
            }
        } else {
            None
        };
        vault::delete(&connection.credential_reference())?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
        if let Some(item) = state.connections.iter_mut().find(|item| item.id == id) {
            item.connected = false;
        }
        if state.current_official.as_deref() == Some(id) {
            state.current_official = None;
        }
        self.save(&state)?;
        Ok(warning)
    }

    pub fn preview(&self, id: &str, agent: &str, model: &str) -> AppResult<ConfigPreview> {
        let connection = self.connection(id)?;
        let provider = crate::agent::get(agent)?;
        let config = agent_config(&connection, agent, model, "")?;
        let mut preview = provider.preview(&config)?;
        preview.provider = reqwest::Url::parse(&connection.site_url)
            .unwrap()
            .host_str()
            .unwrap_or("模型服务")
            .into();
        preview.masked_api_key = "确认后由程序安全获取".into();
        Ok(preview)
    }

    pub fn apply(
        &self,
        id: &str,
        agent: &str,
        model: &str,
        progress: Option<&Channel<ConnectionStep>>,
    ) -> AppResult<ConfigurationOutcome> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| AppError::Other("另一个配置正在进行，请稍后再试".into()))?;
        let connection = self.connection(id)?;
        let provider = crate::agent::get(agent)?;
        agent_config(&connection, agent, model, "")?;
        if !connection.connected
            || connection
                .expires_at
                .is_some_and(|expiry| expiry <= chrono::Utc::now().timestamp())
        {
            return Err(AppError::Auth(
                "此连接需要重新登录；已配置的工具仍可启动".into(),
            ));
        }
        if connection.kind != ConnectionKind::ApiKey
            && !self.models(id)?.iter().any(|item| item == model)
        {
            return Err(AppError::Other("请选择此账户实际支持的模型".into()));
        }
        if !provider.detect().installed {
            return Err(AppError::NotFound(format!(
                "{}，请到系统诊断检查安装状态",
                provider.name()
            )));
        }
        let mut steps = Vec::new();
        let mut emit = |step: &str, status: &str, detail: Option<String>| {
            let result = ConnectionStep {
                step: step.into(),
                status: status.into(),
                detail,
            };
            if let Some(channel) = progress {
                let _ = channel.send(result.clone());
            }
            steps.push(result);
        };
        emit("检查环境", "complete", None);
        // All managed issuance happens only after the user confirms.
        let key_reference = connection.tool_reference(agent);
        let mut token_id = None;
        let key = if connection.kind == ConnectionKind::ApiKey {
            vault::get(&connection.credential_reference())?
        } else if connection.kind == ConnectionKind::KuncodeAuthorized {
            let token = vault::get(&connection.credential_reference())?;
            let response = SiteClient::new()?.request(
                reqwest::Method::PUT,
                &format!("{}/api/desktop/tools/{agent}", connection.site_url),
                Some(&token),
                None,
                Some(json!({"model":model})),
            )?;
            let data = response
                .get("data")
                .ok_or_else(|| AppError::Other("无法获取工具配置".into()))?;
            token_id = data.get("id").and_then(Value::as_i64);
            data.get("key")
                .and_then(Value::as_str)
                .filter(|key| !key.is_empty())
                .ok_or_else(|| AppError::Other("无法获取工具配置".into()))?
                .to_owned()
        } else {
            let cached_id = self
                .state
                .lock()
                .map_err(|_| AppError::Other("连接状态暂不可用".into()))?
                .tool_keys
                .get(&key_reference)
                .copied()
                .flatten();
            let cached_key = if let Some(existing_id) = cached_id {
                match vault::get(&key_reference) {
                    Ok(key) => Some(key),
                    Err(_) => {
                        let token = vault::get(&connection.credential_reference())?;
                        Some(SiteClient::new()?.read_tool_key(&connection.site_url, &token, connection.legacy_user_id, existing_id)
                            .map_err(|_| AppError::Other("无法恢复已创建的工具密钥，不会重复创建；请在站点核对或改用已有 API Key".into()))?)
                    }
                }
            } else {
                None
            };
            let reusable = match cached_key.as_ref() {
                Some(key) => !matches!(
                    SiteClient::new()?.models(&connection.api_base_url, key, None, false, None),
                    Err(AppError::Auth(_))
                ),
                None => false,
            };
            if reusable {
                token_id = cached_id;
                cached_key.unwrap()
            } else {
                let token = vault::get(&connection.credential_reference())?;
                let (name, resume) = {
                    let mut state = self
                        .state
                        .lock()
                        .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
                    match state.pending_keys.get(&key_reference) {
                        Some(name) => (name.clone(), true),
                        None => {
                            let name = format!(
                                "KunCode Setup-{agent}-{}",
                                &Uuid::new_v4().simple().to_string()[..12]
                            );
                            state
                                .pending_keys
                                .insert(key_reference.clone(), name.clone());
                            self.save(&state)?;
                            (name, false)
                        }
                    }
                };
                let (created_id, key) = SiteClient::new()?.create_tool_key(
                    &connection.site_url,
                    &token,
                    connection.legacy_user_id,
                    &name,
                    resume,
                )?;
                token_id = Some(created_id);
                key
            }
        };
        vault::put(&key_reference, &key)?;
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
            state.tool_keys.insert(key_reference.clone(), token_id);
            state.pending_keys.remove(&key_reference);
            self.save(&state)?;
        }
        emit("准备工具凭据", "complete", None);
        provider.backup()?;
        emit("备份原配置", "complete", None);
        let originals: Vec<_> = provider
            .configuration_paths()
            .into_iter()
            .map(|path| {
                let bytes = match std::fs::read(&path) {
                    Ok(bytes) => Ok(Some(bytes)),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
                    Err(error) => Err(AppError::from(error)),
                }?;
                Ok((path, bytes))
            })
            .collect::<AppResult<Vec<_>>>()?;
        if let Err(error) = provider.configure(&agent_config(&connection, agent, model, &key)?) {
            for (path, bytes) in &originals {
                match bytes {
                    Some(bytes) => {
                        std::fs::write(path, bytes)?;
                    }
                    None if path.exists() => {
                        std::fs::remove_file(path)?;
                    }
                    _ => {}
                }
            }
            return Err(error);
        }
        emit("写入配置", "complete", None);
        let mut binding = ToolBinding {
            agent_id: agent.into(),
            connection_id: id.into(),
            model: model.into(),
            token_id,
            status: "ready".into(),
            verified: false,
        };
        match SiteClient::new()?.models(&connection.api_base_url, &key, None, false, None) {
            Ok(_) => {
                binding.verified = true;
                emit(
                    "检查服务连接",
                    "complete",
                    Some("凭据可读取模型列表；未执行付费推理".into()),
                );
            }
            Err(AppError::Auth(_)) => {
                binding.status = "error".into();
                emit(
                    "检查服务连接",
                    "error",
                    Some("工具密钥无效或权限不足".into()),
                );
            }
            Err(_) => {
                emit(
                    "检查服务连接",
                    "warning",
                    Some("配置已保存，连接尚未验证；可以稍后重试".into()),
                );
            }
        }
        self.record_binding(binding.clone())?;
        Ok(ConfigurationOutcome { binding, steps })
    }

    fn record_binding(&self, binding: ToolBinding) -> AppResult<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
        state.bindings.insert(binding.agent_id.clone(), binding);
        self.save(&state)
    }

    pub fn probe_binding(&self, agent: &str) -> AppResult<TestResult> {
        let binding = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?
            .bindings
            .get(agent)
            .cloned()
            .ok_or_else(|| AppError::Auth("请先配置此工具".into()))?;
        let connection = self.connection(&binding.connection_id)?;
        let key = match vault::get(&connection.tool_reference(agent)) {
            Ok(key) => key,
            Err(error) => {
                let mut damaged = binding;
                damaged.status = "error".into();
                self.record_binding(damaged)?;
                return Err(error);
            }
        };
        if !crate::agent::get(agent)?.configuration_matches(&agent_config(
            &connection,
            agent,
            &binding.model,
            &key,
        )?)? {
            let mut damaged = binding;
            damaged.status = "error".into();
            self.record_binding(damaged)?;
            return Err(AppError::Parse("工具配置已变化或损坏，请修复配置".into()));
        }
        let started = Instant::now();
        match SiteClient::new()?.models(&connection.api_base_url, &key, None, false, None) {
            Ok(_) => Ok(TestResult {
                ok: true,
                latency_ms: Some(started.elapsed().as_millis() as u64),
                message: "连接可读取模型列表，未执行付费推理".into(),
            }),
            Err(AppError::Unsupported(_)) => Ok(TestResult {
                ok: true,
                latency_ms: None,
                message: "此站点不提供模型列表，实际调用尚未验证".into(),
            }),
            Err(error) => {
                if matches!(error, AppError::Auth(_)) {
                    let mut failed = binding;
                    failed.status = "error".into();
                    self.record_binding(failed)?;
                }
                Err(error)
            }
        }
    }
}

fn agent_config(
    connection: &ConnectionSummary,
    agent: &str,
    model: &str,
    key: &str,
) -> AppResult<AgentConfig> {
    if model.trim().is_empty() || model.len() > 256 || model.contains(['\r', '\n']) {
        return Err(AppError::Other("请选择或填写有效模型".into()));
    }
    let base = if agent == "claude" {
        connection
            .api_base_url
            .strip_suffix("/v1")
            .unwrap_or(&connection.api_base_url)
    } else {
        &connection.api_base_url
    };
    Ok(AgentConfig {
        agent_id: agent.into(),
        model: model.into(),
        base_url: base.into(),
        api_key: key.into(),
    })
}
