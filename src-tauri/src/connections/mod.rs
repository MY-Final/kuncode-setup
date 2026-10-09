mod configuration;
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
use http::{normalize_url, SiteClient, SiteConnection, KUNCODE_SITE};

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
    /// 用户自定义别名，优先于 account / 域名展示。
    #[serde(default)]
    pub alias: Option<String>,
    /// 用户自定义备注。
    #[serde(default)]
    pub note: Option<String>,
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
    #[serde(default)]
    pub models: Vec<String>,
    #[serde(default)]
    pub group: Option<String>,
    pub token_id: Option<i64>,
    pub status: String,
    pub verified: bool,
    #[serde(default)]
    pub inference_verified: bool,
}

#[derive(Clone, Serialize, Deserialize)]
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
    #[serde(default)]
    pub prepared_keys: HashMap<String, i64>,
    #[serde(default)]
    pub backups: HashMap<String, Vec<configuration::ToolBackup>>,
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
            prepared_keys: HashMap::new(),
            backups: HashMap::new(),
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

/// Account/service profile shown in the user menu. `provider` is the stable
/// extension point: KunCode currently reports `newapi`, and a future sub2api
/// backend can return the same shape without changing the desktop UI.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountProfile {
    pub connection_id: String,
    pub provider: String,
    pub kind: ConnectionKind,
    pub site_url: String,
    /// Whether the site reported an authenticated account (false for API Key).
    pub authenticated: bool,
    pub account: Option<String>,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub user_id: Option<i64>,
    pub email: Option<String>,
    pub role: Option<String>,
    pub group: Option<String>,
    pub status: Option<String>,
    /// Balance in the site's display unit (currency amount, or token count).
    pub balance: Option<f64>,
    pub used_quota: Option<f64>,
    pub request_count: Option<i64>,
    pub quota_display_type: Option<String>,
    pub currency_symbol: Option<String>,
    pub quota_per_unit: Option<f64>,
    pub member_since: Option<i64>,
    pub expires_at: Option<i64>,
    pub connected: bool,
}
/// Request-context values derived from a connection for site key calls.
struct SiteContext {
    user_id: Option<i64>,
    desktop: bool,
}

/// Model and key selection for one `apply` call.
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplySelection {
    pub model: String,
    #[serde(default)]
    pub models: Vec<String>,
    #[serde(default)]
    pub token_id: Option<i64>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub rebuild: bool,
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

/// 从备份恢复某个工具配置后的结果。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
    pub agent_id: String,
    /// 已从备份恢复的配置文件路径。
    pub restored: Vec<String>,
    /// 没有找到备份、保持原样的配置文件路径。
    pub missing: Vec<String>,
    pub removed: Vec<String>,
}

/// 启动前一致性校验结果。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BindingCheck {
    pub agent_id: String,
    pub ok: bool,
    /// 失败类别：config（本机配置损坏）/ key（密钥失效）/ network（网络不可用）。
    pub reason: String,
    /// 是否建议直接换绑其他密钥。
    pub needs_rebind: bool,
    pub message: String,
}

impl BindingCheck {
    fn ok(agent: &str) -> Self {
        Self {
            agent_id: agent.into(),
            ok: true,
            reason: "ok".into(),
            needs_rebind: false,
            message: "本机配置与站点密钥一致".into(),
        }
    }
    fn rebind(agent: &str, message: &str) -> Self {
        Self {
            agent_id: agent.into(),
            ok: false,
            reason: "key".into(),
            needs_rebind: true,
            message: message.into(),
        }
    }
}

/// 工具配置文件的脱敏视图。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFileView {
    pub path: String,
    pub exists: bool,
    /// 已脱敏的文件内容；文件不存在时为 None。
    pub content: Option<String>,
}

/// 已配置工具的详情视图。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDetail {
    pub agent_id: String,
    pub agent_name: String,
    pub connection_id: String,
    /// 展示用连接标签：别名 > 账户 > 域名。
    pub connection_label: Option<String>,
    pub site_url: String,
    pub base_url: String,
    pub model: String,
    pub models: Vec<String>,
    pub group: Option<String>,
    pub token_id: Option<i64>,
    pub status: String,
    pub verified: bool,
    pub inference_verified: bool,
    pub config_paths: Vec<String>,
    pub config_files: Vec<ConfigFileView>,
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
            alias: None,
            note: None,
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

    /// Reads the account/service profile for the user menu. KunCode returns the
    /// stable `/api/desktop/profile` contract; API Key connections have no
    /// account, so only the service summary is returned.
    pub fn profile(&self, id: &str) -> AppResult<AccountProfile> {
        let connection = self.connection(id)?;
        let secret = vault::get(&connection.credential_reference())?;
        let client = SiteClient::new()?;
        if connection.kind == ConnectionKind::ApiKey {
            return Ok(AccountProfile {
                connection_id: connection.id,
                provider: "openai_compatible".into(),
                kind: connection.kind,
                site_url: connection.site_url,
                authenticated: false,
                account: connection.account,
                username: None,
                display_name: None,
                user_id: None,
                email: None,
                role: None,
                group: None,
                status: None,
                balance: None,
                used_quota: None,
                request_count: None,
                quota_display_type: None,
                currency_symbol: None,
                quota_per_unit: None,
                member_since: None,
                expires_at: connection.expires_at,
                connected: connection.connected,
            });
        }
        // The stable desktop contract is preferred. Sites that only expose the
        // generic New API management API fall back to `/api/user/self` plus the
        // public `/api/status` display preferences, so a future sub2api build
        // can adopt either shape without a desktop change.
        let desktop = if connection.kind == ConnectionKind::KuncodeAuthorized {
            client.desktop_profile(&connection.site_url, &secret).ok()
        } else {
            None
        };
        let (provider, user, quota) = match desktop.and_then(|response| {
            response
                .get("data")
                .filter(|value| value.is_object())
                .cloned()
        }) {
            Some(data) => (
                data.get("provider")
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty())
                    .unwrap_or("newapi")
                    .to_owned(),
                data.get("user").filter(|value| value.is_object()).cloned(),
                data.get("quota").filter(|value| value.is_object()).cloned(),
            ),
            None => {
                let profile =
                    client.profile(&connection.site_url, &secret, connection.legacy_user_id)?;
                let quota = client
                    .status(&connection.site_url)
                    .ok()
                    .map(|status| quota_from_status(&status, &profile));
                ("newapi".to_owned(), Some(profile), quota)
            }
        };
        let text = |value: Option<&Value>| {
            value
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        };
        let number = |value: Option<&Value>| value.and_then(Value::as_f64);
        let user = user.as_ref();
        let user_id = user
            .and_then(|value| value.get("id"))
            .and_then(Value::as_i64);
        let role = match user
            .and_then(|value| value.get("role"))
            .and_then(Value::as_i64)
        {
            Some(100) => Some("超级管理员".to_owned()),
            Some(10) => Some("管理员".to_owned()),
            _ => None,
        };
        let status = match user
            .and_then(|value| value.get("status"))
            .and_then(Value::as_i64)
        {
            Some(1) => Some("正常".to_owned()),
            Some(_) => Some("已停用".to_owned()),
            None => None,
        };
        Ok(AccountProfile {
            connection_id: connection.id,
            provider,
            kind: connection.kind,
            site_url: connection.site_url,
            authenticated: user_id.is_some(),
            account: connection.account.or_else(|| {
                user.and_then(|value| text(value.get("display_name")))
                    .or_else(|| user.and_then(|value| text(value.get("username"))))
            }),
            username: user.and_then(|value| text(value.get("username"))),
            display_name: user.and_then(|value| text(value.get("display_name"))),
            user_id,
            email: user.and_then(|value| text(value.get("email"))),
            role,
            group: user.and_then(|value| text(value.get("group"))),
            status,
            balance: quota
                .as_ref()
                .and_then(|value| number(value.get("balance"))),
            used_quota: quota.as_ref().and_then(|value| number(value.get("used"))),
            request_count: user
                .and_then(|value| value.get("request_count"))
                .and_then(Value::as_i64),
            quota_display_type: quota
                .as_ref()
                .and_then(|value| text(value.get("display_type"))),
            currency_symbol: quota.as_ref().and_then(|value| text(value.get("symbol"))),
            quota_per_unit: quota
                .as_ref()
                .and_then(|value| number(value.get("quota_per_unit"))),
            member_since: user
                .and_then(|value| value.get("created_at"))
                .and_then(Value::as_i64),
            expires_at: connection.expires_at,
            connected: connection.connected,
        })
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

    /// Builds the request context for site-level key management. Desktop
    /// connections use the dedicated desktop key API; user-token connections
    /// use the dashboard token API.
    fn site_connection(&self, connection: &ConnectionSummary) -> AppResult<(String, SiteContext)> {
        let secret = vault::get(&connection.credential_reference())?;
        let context = SiteContext {
            user_id: if connection.kind == ConnectionKind::KuncodeAuthorized {
                None
            } else {
                connection.legacy_user_id
            },
            desktop: connection.kind == ConnectionKind::KuncodeAuthorized,
        };
        Ok((secret, context))
    }

    pub fn site_tokens(&self, id: &str) -> AppResult<Vec<http::SiteToken>> {
        let connection = self.connection(id)?;
        let (secret, context) = self.site_connection(&connection)?;
        SiteClient::new()?.list_site_tokens(&SiteConnection {
            site: &connection.site_url,
            secret: &secret,
            user_id: context.user_id,
            desktop: context.desktop,
        })
    }

    pub fn site_groups(&self, id: &str) -> AppResult<Vec<http::SiteGroup>> {
        let connection = self.connection(id)?;
        let (secret, context) = self.site_connection(&connection)?;
        SiteClient::new()?.user_groups(&SiteConnection {
            site: &connection.site_url,
            secret: &secret,
            user_id: context.user_id,
            desktop: context.desktop,
        })
    }

    pub fn site_group_models(&self, id: &str, group: &str) -> AppResult<Vec<String>> {
        let connection = self.connection(id)?;
        let (secret, context) = self.site_connection(&connection)?;
        SiteClient::new()?.group_models(
            &SiteConnection {
                site: &connection.site_url,
                secret: &secret,
                user_id: context.user_id,
                desktop: context.desktop,
            },
            group,
        )
    }

    pub fn create_site_token(
        &self,
        id: &str,
        name: &str,
        group: &str,
        model_limits: &[String],
    ) -> AppResult<i64> {
        let connection = self.connection(id)?;
        let (secret, context) = self.site_connection(&connection)?;
        let (token_id, key) = SiteClient::new()?.create_site_token(
            &SiteConnection {
                site: &connection.site_url,
                secret: &secret,
                user_id: context.user_id,
                desktop: context.desktop,
            },
            name,
            group,
            model_limits,
        )?;
        vault::put(
            &connection.tool_reference(&format!("token-{token_id}")),
            &key,
        )?;
        Ok(token_id)
    }

    pub fn update_site_token(
        &self,
        id: &str,
        token_id: i64,
        name: &str,
        group: &str,
        model_limits: &[String],
    ) -> AppResult<()> {
        let connection = self.connection(id)?;
        let (secret, context) = self.site_connection(&connection)?;
        SiteClient::new()?.update_site_token(
            &SiteConnection {
                site: &connection.site_url,
                secret: &secret,
                user_id: context.user_id,
                desktop: context.desktop,
            },
            token_id,
            name,
            group,
            model_limits,
        )
    }

    pub fn delete_site_token(&self, id: &str, token_id: i64) -> AppResult<()> {
        let connection = self.connection(id)?;
        let (secret, context) = self.site_connection(&connection)?;
        SiteClient::new()?.delete_site_token(
            &SiteConnection {
                site: &connection.site_url,
                secret: &secret,
                user_id: context.user_id,
                desktop: context.desktop,
            },
            token_id,
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

    pub fn preview(
        &self,
        id: &str,
        agent: &str,
        model: &str,
        models: &[String],
    ) -> AppResult<ConfigPreview> {
        let connection = self.connection(id)?;
        let provider = crate::agent::get(agent)?;
        let config = agent_config(&connection, agent, model, models, "")?;
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
        selection: ApplySelection,
        progress: Option<&Channel<ConnectionStep>>,
    ) -> AppResult<ConfigurationOutcome> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| AppError::Other("另一个配置正在进行，请稍后再试".into()))?;
        let connection = self.connection(id)?;
        let provider = crate::agent::get(agent)?;
        let mut config = agent_config(&connection, agent, &selection.model, &selection.models, "")?;
        if !connection.connected
            || connection
                .expires_at
                .is_some_and(|expiry| expiry <= chrono::Utc::now().timestamp())
        {
            return Err(AppError::Auth(
                "此连接需要重新登录；已配置的工具仍可启动".into(),
            ));
        }
        if !provider.detect().installed {
            return Err(AppError::NotFound(format!(
                "{}，请到系统诊断检查安装状态",
                provider.name()
            )));
        }
        // Parse every existing file before any remote creation or local mutation.
        if !selection.rebuild {
            provider.validate_existing()?;
        }
        if connection.kind != ConnectionKind::ApiKey {
            let available = match selection.group.as_deref().filter(|group| !group.is_empty()) {
                Some(group) => self.site_group_models(id, group)?,
                None => self.models(id)?,
            };
            verify_selected_models(&available, &config.effective_models())?;
        }
        let remote = self.capture_remote_tool(&connection, agent, selection.token_id)?;
        let operation = (|| {
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
            let (token_id, key) = self.prepare_tool_key(&connection, agent, &selection)?;
            config.api_key = key;
            emit("准备工具凭据", "complete", None);
            let check = SiteClient::new()?.models(
                &connection.api_base_url,
                &config.api_key,
                None,
                false,
                None,
            );
            let (verified, notice) = match check {
                Ok(available) => {
                    verify_selected_models(&available, &config.effective_models())?;
                    (true, None)
                }
                Err(error @ (AppError::Auth(_) | AppError::Permission(_))) => return Err(error),
                Err(AppError::Unsupported(_)) => (
                    false,
                    Some("站点不提供模型列表；配置将保存，实际调用尚未验证".into()),
                ),
                Err(_) => (
                    false,
                    Some("暂时无法检查模型列表；配置将保存，可以稍后重试".into()),
                ),
            };
            let binding = ToolBinding {
                agent_id: agent.into(),
                connection_id: id.into(),
                model: config.model.clone(),
                models: config.effective_models(),
                group: selection.group.filter(|group| !group.is_empty()),
                token_id,
                status: "ready".into(),
                verified,
                inference_verified: false,
            };
            self.commit_configuration(
                provider.as_ref(),
                &config,
                &connection,
                binding.clone(),
                selection.rebuild,
                &mut |stage| emit(stage, "complete", None),
            )?;
            emit(
                "检查服务连接",
                if verified { "complete" } else { "warning" },
                notice.or_else(|| {
                    Some("所选模型均在密钥可读取的模型列表中；实际推理和 Streaming 尚未验证".into())
                }),
            );
            Ok(ConfigurationOutcome { binding, steps })
        })();
        match operation {
            Ok(outcome) => Ok(outcome),
            Err(error) => {
                if let Some(snapshot) = &remote {
                    if let Err(compensation) =
                        self.compensate_remote_tool(&connection, agent, snapshot)
                    {
                        return Err(AppError::Other(format!("{error}；{compensation}")));
                    }
                }
                Err(error)
            }
        }
    }

    fn prepare_tool_key(
        &self,
        connection: &ConnectionSummary,
        agent: &str,
        selection: &ApplySelection,
    ) -> AppResult<(Option<i64>, String)> {
        if connection.kind == ConnectionKind::ApiKey {
            if selection.token_id.is_some() {
                return Err(AppError::Other("API Key 服务连接无需选择站点密钥".into()));
            }
            return Ok((None, vault::get(&connection.credential_reference())?));
        }
        let (secret, context) = self.site_connection(connection)?;
        let client = SiteClient::new()?;
        if connection.kind == ConnectionKind::KuncodeAuthorized {
            let body = match selection.token_id {
                Some(id) => {
                    json!({"token_id": id, "group": selection.group.as_deref().unwrap_or(""), "models": agent_config(connection, agent, &selection.model, &selection.models, "")?.effective_models()})
                }
                None => json!({"model": selection.model}),
            };
            let response = client.request(
                reqwest::Method::PUT,
                &format!("{}/api/desktop/tools/{agent}", connection.site_url),
                Some(&secret),
                None,
                Some(body),
            )?;
            let data = response
                .get("data")
                .ok_or_else(|| AppError::Other("无法获取工具配置".into()))?;
            let id = data
                .get("id")
                .and_then(Value::as_i64)
                .filter(|id| *id > 0)
                .ok_or_else(|| AppError::Other("无法获取工具密钥 ID".into()))?;
            let key = data
                .get("key")
                .and_then(Value::as_str)
                .filter(|key| !key.is_empty() && !key.contains('*'))
                .ok_or_else(|| AppError::Other("无法获取工具密钥".into()))?;
            let key = http::model_key(key)?;
            // The issuance endpoint restricts its key to the default model.
            // Apply the full selected model set before checking key permissions.
            let models = agent_config(connection, agent, &selection.model, &selection.models, "")?
                .effective_models();
            if selection.token_id.is_none() && models.len() > 1 {
                client.request(
                    reqwest::Method::PUT,
                    &format!("{}/api/desktop/tools/{agent}", connection.site_url),
                    Some(&secret),
                    None,
                    Some(json!({"token_id": id, "group": "", "models": models})),
                )?;
            }
            return Ok((Some(id), key));
        }
        if let Some(id) = selection.token_id {
            let key = client.reveal_site_token(
                &SiteConnection {
                    site: &connection.site_url,
                    secret: &secret,
                    user_id: context.user_id,
                    desktop: context.desktop,
                },
                id,
            )?;
            return Ok((Some(id), key));
        }
        let reference = connection.tool_reference(agent);
        // Issuance bookkeeping is separate from the active tool credential.
        // A failed configure can retry the already-created key without changing the old binding.
        let prepared_reference = vault::reference("prepared", &reference, &connection.api_base_url);
        let (prepared_id, active_id) = {
            let state = self
                .state
                .lock()
                .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
            (
                state.prepared_keys.get(&reference).copied(),
                state.tool_keys.get(&reference).copied().flatten(),
            )
        };
        if let Some(id) = prepared_id.or(active_id) {
            let cached = if prepared_id.is_some() {
                vault::get_optional(&prepared_reference)?
            } else {
                vault::get_optional(&reference)?
            };
            let key = match cached {
                Some(key) => key,
                None => client.read_tool_key(&connection.site_url, &secret, context.user_id, id)?,
            };
            if !matches!(
                client.models(&connection.api_base_url, &key, None, false, None),
                Err(AppError::Auth(_) | AppError::Permission(_))
            ) {
                return Ok((Some(id), key));
            }
            // Keep the active credential untouched; only retire an invalid staged key.
            if prepared_id.is_some() {
                let mut state = self
                    .state
                    .lock()
                    .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
                let previous = state.clone();
                state.prepared_keys.remove(&reference);
                if let Err(error) = self.save(&state) {
                    *state = previous;
                    return Err(error);
                }
                vault::delete(&prepared_reference)?;
            }
        }
        let (name, resume) = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
            match state.pending_keys.get(&reference) {
                Some(name) => (name.clone(), true),
                None => {
                    let previous = state.clone();
                    let name = format!(
                        "KunCode Setup-{agent}-{}",
                        &Uuid::new_v4().simple().to_string()[..12]
                    );
                    state.pending_keys.insert(reference.clone(), name.clone());
                    if let Err(error) = self.save(&state) {
                        *state = previous;
                        return Err(error);
                    }
                    (name, false)
                }
            }
        };
        let (id, key) = client.create_tool_key(
            &connection.site_url,
            &secret,
            context.user_id,
            &name,
            resume,
        )?;
        vault::put(&prepared_reference, &key)?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
        let previous = state.clone();
        state.prepared_keys.insert(reference.clone(), id);
        state.pending_keys.remove(&reference);
        if let Err(error) = self.save(&state) {
            *state = previous;
            return Err(error);
        }
        Ok((Some(id), key))
    }

    fn record_binding(&self, binding: ToolBinding) -> AppResult<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
        let previous = state.clone();
        state.bindings.insert(binding.agent_id.clone(), binding);
        if let Err(error) = self.save(&state) {
            *state = previous;
            return Err(error);
        }
        Ok(())
    }

    /// 修改某个连接的别名与备注，其余字段保持不变。
    pub fn rename_connection(
        &self,
        id: &str,
        alias: Option<String>,
        note: Option<String>,
    ) -> AppResult<ConnectionSummary> {
        let clean = |value: Option<String>| {
            value
                .map(|text| text.trim().to_owned())
                .filter(|text| !text.is_empty())
        };
        let alias = clean(alias);
        let note = clean(note);
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
        let connection = state
            .connections
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| AppError::Auth("请选择或重新连接站点".into()))?;
        if alias
            .as_deref()
            .is_some_and(|text| text.chars().count() > 50)
        {
            return Err(AppError::Other("别名不能超过 50 个字符".into()));
        }
        if note
            .as_deref()
            .is_some_and(|text| text.chars().count() > 200)
        {
            return Err(AppError::Other("备注不能超过 200 个字符".into()));
        }
        connection.alias = alias;
        connection.note = note;
        let updated = connection.clone();
        self.save(&state)?;
        Ok(updated)
    }

    /// 读取某个已配置工具的详情，包括脱敏后的配置文件内容。
    pub fn tool_detail(&self, agent: &str) -> AppResult<ToolDetail> {
        let binding = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?
            .bindings
            .get(agent)
            .cloned()
            .ok_or_else(|| AppError::Auth("请先配置此工具".into()))?;
        let connection = self.connection(&binding.connection_id)?;
        let provider = crate::agent::get(agent)?;
        let key = vault::get(&connection.tool_reference(agent)).unwrap_or_default();
        let config = agent_config(&connection, agent, &binding.model, &binding.models, &key)?;
        let config_files = provider
            .configuration_paths()
            .into_iter()
            .map(|path| {
                let exists = path.exists();
                let content = if exists && path.file_name().is_some_and(|name| name == "auth.json")
                {
                    Some("凭据文件已存在；API Key 和已有登录信息均已隐藏".into())
                } else if exists {
                    std::fs::read_to_string(&path)
                        .ok()
                        .map(|text| mask_config_text(&text, &key))
                } else {
                    None
                };
                ConfigFileView {
                    path: path.to_string_lossy().to_string(),
                    exists,
                    content,
                }
            })
            .collect();
        Ok(ToolDetail {
            agent_id: agent.into(),
            agent_name: provider.name().into(),
            connection_id: connection.id.clone(),
            connection_label: connection
                .alias
                .clone()
                .or_else(|| connection.account.clone()),
            site_url: connection.site_url.clone(),
            base_url: config.base_url.clone(),
            model: binding.model.clone(),
            models: if binding.models.is_empty() {
                vec![binding.model.clone()]
            } else {
                binding.models.clone()
            },
            group: binding.group.clone(),
            token_id: binding.token_id,
            status: binding.status.clone(),
            verified: binding.verified,
            inference_verified: binding.inference_verified,
            config_paths: provider
                .configuration_paths()
                .into_iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect(),
            config_files,
        })
    }

    /// 读取某个站点密钥的明文，仅供前端一次性复制到剪贴板。
    pub fn reveal_site_token_for_copy(&self, id: &str, token_id: i64) -> AppResult<String> {
        let connection = self.connection(id)?;
        let (secret, context) = self.site_connection(&connection)?;
        SiteClient::new()?.reveal_site_token(
            &SiteConnection {
                site: &connection.site_url,
                secret: &secret,
                user_id: context.user_id,
                desktop: context.desktop,
            },
            token_id,
        )
    }

    /// 对某个连接做一次模型列表探测，返回延迟（毫秒）。
    pub fn connection_latency(&self, id: &str) -> AppResult<Option<u64>> {
        let connection = self.connection(id)?;
        let secret = vault::get(&connection.credential_reference())?;
        let started = Instant::now();
        match SiteClient::new()?.models(
            &connection.api_base_url,
            &secret,
            connection.legacy_user_id,
            false,
            None,
        ) {
            Ok(_) => Ok(Some(started.elapsed().as_millis() as u64)),
            // 站点不提供模型列表时仍视作可达。
            Err(AppError::Unsupported(_)) => Ok(Some(started.elapsed().as_millis() as u64)),
            Err(error) => Err(error),
        }
    }

    /// This check shares the same local/config/model validation as diagnostics.
    pub fn check_binding(&self, agent: &str) -> AppResult<BindingCheck> {
        match self.probe_binding(agent) {
            Ok(result) if result.ok => Ok(BindingCheck::ok(agent)),
            Ok(result) => Ok(BindingCheck {
                agent_id: agent.into(),
                ok: false,
                reason: "unverified".into(),
                needs_rebind: false,
                message: result.message,
            }),
            Err(error @ (AppError::Auth(_) | AppError::Permission(_))) => {
                Ok(BindingCheck::rebind(agent, &error.to_string()))
            }
            Err(error) => Ok(BindingCheck {
                agent_id: agent.into(),
                ok: false,
                reason: match error {
                    AppError::Parse(_) => "config",
                    AppError::Unsupported(_) => "model",
                    _ => "network",
                }
                .into(),
                needs_rebind: false,
                message: error.to_string(),
            }),
        }
    }

    /// Restore a complete batch, including the previous binding when one existed.
    pub fn restore_agent(&self, agent: &str) -> AppResult<RestoreOutcome> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| AppError::Other("另一个配置正在进行，请稍后再试".into()))?;
        self.restore_configuration(crate::agent::get(agent)?.as_ref())
    }

    pub fn probe_binding(&self, agent: &str) -> AppResult<TestResult> {
        self.probe_binding_mode(agent)
    }

    fn probe_binding_mode(&self, agent: &str) -> AppResult<TestResult> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| AppError::Other("另一个配置或检查正在进行，请稍后再试".into()))?;
        let mut binding = self
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
                if matches!(error, AppError::Auth(_)) {
                    binding.status = "error".into();
                    binding.verified = false;
                    binding.inference_verified = false;
                    self.record_binding(binding)?;
                }
                return Err(error);
            }
        };
        let config = agent_config(&connection, agent, &binding.model, &binding.models, &key)?;
        if !crate::agent::get(agent)?.configuration_matches(&config)? {
            binding.status = "error".into();
            binding.verified = false;
            binding.inference_verified = false;
            self.record_binding(binding)?;
            return Err(AppError::Parse("工具配置已变化或损坏，请修复配置".into()));
        }
        let started = Instant::now();
        let result =
            match SiteClient::new()?.models(&connection.api_base_url, &key, None, false, None) {
                Ok(available) => verify_selected_models(&available, &config.effective_models()),
                Err(AppError::Unsupported(_)) => {
                    binding.verified = false;
                    self.record_binding(binding)?;
                    return Ok(TestResult {
                        ok: false,
                        latency_ms: None,
                        message:
                            "此站点不提供模型列表；已配置，实际调用尚未验证，可运行实际调用测试"
                                .into(),
                    });
                }
                Err(error) => Err(error),
            };
        match result {
            Ok(()) => {
                binding.status = "ready".into();
                binding.verified = true;
                self.record_binding(binding)?;
                Ok(TestResult {
                    ok: true,
                    latency_ms: Some(started.elapsed().as_millis() as u64),
                    message: "所选模型列表检查已通过；实际推理和 Streaming 尚未验证".into(),
                })
            }
            Err(error) => {
                binding.verified = false;
                if matches!(
                    error,
                    AppError::Auth(_) | AppError::Permission(_) | AppError::Unsupported(_)
                ) {
                    binding.inference_verified = false;
                }
                if matches!(
                    error,
                    AppError::Auth(_) | AppError::Permission(_) | AppError::Unsupported(_)
                ) {
                    binding.status = "error".into();
                }
                self.record_binding(binding)?;
                Err(error)
            }
        }
    }
}

/// Never return raw text when parsing fails: it may contain unrecognized secrets.
fn mask_config_text(text: &str, secret: &str) -> String {
    fn sensitive(name: &str) -> bool {
        let name: String = name
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .flat_map(char::to_lowercase)
            .collect();
        [
            "key",
            "token",
            "password",
            "secret",
            "authorization",
            "credential",
            "cookie",
            "session",
            "auth",
        ]
        .iter()
        .any(|field| name.contains(field))
    }
    fn redact(value: &mut Value, secret: &str) {
        match value {
            Value::Object(fields) => {
                for (name, value) in fields {
                    if sensitive(name) {
                        *value = json!("••••••••");
                    } else {
                        redact(value, secret);
                    }
                }
            }
            Value::Array(items) => {
                for item in items {
                    redact(item, secret);
                }
            }
            Value::String(text)
                if (!secret.is_empty() && text.contains(secret))
                    || text.contains("sk-")
                    || text.to_ascii_lowercase().contains("bearer ") =>
            {
                *text = "sk-••••••••".into();
            }
            _ => {}
        }
    }
    if let Ok(mut value) = serde_json::from_str::<Value>(text) {
        redact(&mut value, secret);
        return serde_json::to_string_pretty(&value)
            .unwrap_or_else(|_| "配置内容无法安全显示".into());
    }
    if let Ok(value) = toml::from_str::<toml::Value>(text) {
        if let Ok(mut value) = serde_json::to_value(value) {
            redact(&mut value, secret);
            if let Ok(value) = serde_json::from_value::<toml::Value>(value) {
                return toml::to_string_pretty(&value)
                    .unwrap_or_else(|_| "配置内容无法安全显示".into());
            }
        }
    }
    "配置无法解析，为保护凭据已隐藏内容；请修复配置或恢复备份".into()
}

fn verify_selected_models(available: &[String], selected: &[String]) -> AppResult<()> {
    if selected.iter().any(|model| !available.contains(model)) {
        return Err(AppError::Unsupported(
            "所选模型不在当前密钥的可用列表中，请重新选择模型或换绑密钥".into(),
        ));
    }
    Ok(())
}

fn agent_config(
    connection: &ConnectionSummary,
    agent: &str,
    model: &str,
    models: &[String],
    key: &str,
) -> AppResult<AgentConfig> {
    if std::iter::once(model)
        .chain(models.iter().map(String::as_str))
        .any(|item| item.trim().is_empty() || item.len() > 256 || item.contains(['\r', '\n']))
    {
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
        models: models.to_vec(),
        base_url: base.into(),
        api_key: key.into(),
    })
}
/// Converts the public site status and a generic New API profile into the same
/// display shape the KunCode desktop endpoint returns.
fn quota_from_status(status: &Value, profile: &Value) -> Value {
    let quota = profile.get("quota").and_then(Value::as_i64).unwrap_or(0);
    let used = profile
        .get("used_quota")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let per_unit = status
        .get("quota_per_unit")
        .and_then(Value::as_f64)
        .filter(|value| *value > 0.0)
        .unwrap_or(500_000.0);
    let display_type = status
        .get("quota_display_type")
        .and_then(Value::as_str)
        .unwrap_or("USD")
        .to_owned();
    if display_type == "TOKENS" {
        return json!({
            "display_type": "TOKENS",
            "symbol": "",
            "balance": quota as f64,
            "used": used as f64,
            "quota_per_unit": per_unit,
        });
    }
    // Mirror the site's own display rules: only CNY uses the USD exchange rate,
    // and CUSTOM uses its own rate and symbol.
    let rate = match display_type.as_str() {
        "CNY" => status
            .get("usd_exchange_rate")
            .and_then(Value::as_f64)
            .filter(|value| *value > 0.0)
            .unwrap_or(1.0),
        "CUSTOM" => status
            .get("custom_currency_exchange_rate")
            .and_then(Value::as_f64)
            .filter(|value| *value > 0.0)
            .unwrap_or(1.0),
        _ => 1.0,
    };
    let custom_symbol = status
        .get("custom_currency_symbol")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());
    let symbol = match display_type.as_str() {
        "CNY" => "¥".to_owned(),
        "CUSTOM" => custom_symbol.unwrap_or("¤").to_owned(),
        "USD" => "$".to_owned(),
        _ => String::new(),
    };
    let convert = |value: i64| value as f64 / per_unit * rate;
    json!({
        "display_type": display_type,
        "symbol": symbol,
        "balance": convert(quota),
        "used": convert(used),
        "quota_per_unit": per_unit,
    })
}
