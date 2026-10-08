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
        let model = selection.model.as_str();
        let models = selection.models;
        let token_id = selection.token_id;
        let group = selection.group;
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| AppError::Other("另一个配置正在进行，请稍后再试".into()))?;
        let connection = self.connection(id)?;
        let provider = crate::agent::get(agent)?;
        agent_config(&connection, agent, model, &models, "")?;
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
        // Two paths: bind a key the user picked in the key center, or fall back
        // to the legacy flow that issues a dedicated key per tool.
        if let Some(selected_id) = token_id {
            let (secret, context) = self.site_connection(&connection)?;
            let group = group.unwrap_or_default();
            if context.desktop {
                let token = vault::get(&connection.credential_reference())?;
                SiteClient::new()?.request(
                    reqwest::Method::PUT,
                    &format!("{}/api/desktop/tools/{agent}", connection.site_url),
                    Some(&token),
                    None,
                    Some(json!({"token_id": selected_id, "group": group, "models": models})),
                )?;
            }
            let key = SiteClient::new()?.reveal_site_token(
                &SiteConnection {
                    site: &connection.site_url,
                    secret: &secret,
                    user_id: context.user_id,
                    desktop: context.desktop,
                },
                selected_id,
            )?;
            let key_reference = connection.tool_reference(agent);
            vault::put(&key_reference, &key)?;
            {
                let mut state = self
                    .state
                    .lock()
                    .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
                state
                    .tool_keys
                    .insert(key_reference.clone(), Some(selected_id));
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
            if let Err(error) =
                provider.configure(&agent_config(&connection, agent, model, &models, &key)?)
            {
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
                models: models.clone(),
                group: if group.is_empty() {
                    None
                } else {
                    Some(group.clone())
                },
                token_id: Some(selected_id),
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
            return Ok(ConfigurationOutcome { binding, steps });
        }
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
        if let Err(error) =
            provider.configure(&agent_config(&connection, agent, model, &models, &key)?)
        {
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
            models: models.clone(),
            group: None,
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

    /// 启动前的一致性校验：本机配置是否仍与绑定一致，绑定密钥是否仍然有效。
    /// 预期内的失败不会抛出异常，而是返回结构化状态，便于前端给出精确引导。
    pub fn check_binding(&self, agent: &str) -> AppResult<BindingCheck> {
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
            Err(_) => {
                self.mark_binding_error(agent)?;
                return Ok(BindingCheck::rebind(
                    agent,
                    "工具密钥已从本机凭据中丢失，请重新换绑密钥",
                ));
            }
        };
        let matches = crate::agent::get(agent)?.configuration_matches(&agent_config(
            &connection,
            agent,
            &binding.model,
            &binding.models,
            &key,
        )?)?;
        if !matches {
            self.mark_binding_error(agent)?;
            return Ok(BindingCheck {
                agent_id: agent.into(),
                ok: false,
                reason: "config".into(),
                needs_rebind: false,
                message: "本机工具配置已被修改或损坏，请重新配置或恢复备份".into(),
            });
        }
        match SiteClient::new()?.models(&connection.api_base_url, &key, None, false, None) {
            Ok(_) => Ok(BindingCheck::ok(agent)),
            Err(AppError::Unsupported(_)) => Ok(BindingCheck::ok(agent)),
            Err(AppError::Auth(_)) => {
                self.mark_binding_error(agent)?;
                Ok(BindingCheck::rebind(
                    agent,
                    "绑定的密钥已在站点失效或被停用，请换绑其他可用密钥",
                ))
            }
            Err(error) => Ok(BindingCheck {
                agent_id: agent.into(),
                ok: false,
                reason: "network".into(),
                needs_rebind: false,
                message: format!("暂时无法确认连接状态：{error}"),
            }),
        }
    }

    fn mark_binding_error(&self, agent: &str) -> AppResult<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
        if let Some(binding) = state.bindings.get_mut(agent) {
            binding.status = "error".into();
        }
        self.save(&state)
    }

    /// 用最近一次备份恢复某个工具的原始配置，并解除本机绑定。
    pub fn restore_agent(&self, agent: &str) -> AppResult<RestoreOutcome> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| AppError::Other("另一个配置正在进行，请稍后再试".into()))?;
        let provider = crate::agent::get(agent)?;
        let mut restored = Vec::new();
        let mut missing = Vec::new();
        for path in provider.configuration_paths() {
            match crate::config::latest_backup(&path)? {
                Some(backup) => {
                    crate::config::restore_file(&backup, &path)?;
                    restored.push(path.to_string_lossy().to_string());
                }
                None => missing.push(path.to_string_lossy().to_string()),
            }
        }
        if restored.is_empty() {
            return Err(AppError::NotFound(format!(
                "{} 没有可恢复的备份",
                provider.name()
            )));
        }
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
            state.bindings.remove(agent);
            self.save(&state)?;
        }
        Ok(RestoreOutcome {
            agent_id: agent.into(),
            restored,
            missing,
        })
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
            &binding.models,
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
    models: &[String],
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
