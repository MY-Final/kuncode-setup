use std::io::Read;
use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::{HeaderValue, AUTHORIZATION};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

pub const KUNCODE_SITE: &str = "https://kuncode.120403.xyz";

pub fn normalize_url(raw: &str) -> AppResult<String> {
    let url = reqwest::Url::parse(raw.trim())
        .map_err(|_| AppError::Other("请输入有效的站点地址".into()))?;
    let local = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1"));
    if (url.scheme() != "https" && !(url.scheme() == "http" && local))
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(AppError::Other(
            "站点必须使用 HTTPS，地址中不能包含凭据或查询参数".into(),
        ));
    }
    Ok(url.as_str().trim_end_matches('/').to_owned())
}

pub struct SiteClient {
    client: Client,
}

impl SiteClient {
    pub fn new() -> AppResult<Self> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(20))
            .user_agent("KunCodeSetup/0.1")
            .build()
            .map_err(|_| AppError::Other("无法创建网络连接".into()))?;
        Ok(Self { client })
    }

    pub fn request(
        &self,
        method: reqwest::Method,
        url: &str,
        credential: Option<&str>,
        user_id: Option<i64>,
        body: Option<Value>,
    ) -> AppResult<Value> {
        let mut request = self.client.request(method, url);
        if let Some(secret) = credential {
            let mut header = HeaderValue::from_str(&format!("Bearer {secret}"))
                .map_err(|_| AppError::Auth("连接凭据格式不正确".into()))?;
            header.set_sensitive(true);
            request = request.header(AUTHORIZATION, header);
        }
        if let Some(id) = user_id {
            request = request.header("New-Api-User", id.to_string());
        }
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request
            .send()
            .map_err(|_| AppError::Other("暂时无法连接站点，请检查网络后重试".into()))?;
        match response.status().as_u16() {
            401 => {
                return Err(AppError::Auth(
                    "凭据无效或已失效，请重新登录或检查密钥".into(),
                ))
            }
            403 => {
                return Err(AppError::Permission(
                    "权限不足；用户 Token 需要资料、模型及工具密钥管理权限，可改用已有 API Key"
                        .into(),
                ))
            }
            404 | 405 => {
                return Err(AppError::Unsupported(
                    "该站点不支持此接口，可改用已有 API Key".into(),
                ))
            }
            300..=399 => {
                return Err(AppError::Other(
                    "站点返回了重定向，请填写最终的 HTTPS 地址".into(),
                ))
            }
            429 => return Err(AppError::Other("请求过于频繁，请稍后重试".into())),
            400..=599 => {
                return Err(AppError::Other(
                    "站点暂时无法完成请求，请检查站点状态后重试".into(),
                ))
            }
            _ => {}
        }
        let mut bytes = Vec::new();
        response
            .take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| AppError::Other("站点响应未完整接收，请重试".into()))?;
        if bytes.len() > 2 * 1024 * 1024 {
            return Err(AppError::Unsupported("站点响应过大，无法读取".into()));
        }
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| AppError::Unsupported("站点响应不兼容，可改用已有 API Key".into()))?;
        if value.get("success") == Some(&Value::Bool(false)) {
            return Err(AppError::Other(
                "站点拒绝了请求，请检查权限或高级选项中的用户 ID；也可改用已有 API Key".into(),
            ));
        }
        Ok(value)
    }

    pub fn profile(&self, site: &str, token: &str, user_id: Option<i64>) -> AppResult<Value> {
        let response = self.request(
            reqwest::Method::GET,
            &format!("{site}/api/user/self"),
            Some(token),
            user_id,
            None,
        )?;
        let profile = response
            .get("data")
            .filter(|v| v.is_object())
            .ok_or_else(|| {
                AppError::Unsupported("该站点不提供兼容的账户接口，可改用 API Key".into())
            })?;
        if profile
            .get("id")
            .and_then(Value::as_i64)
            .filter(|id| *id > 0)
            .is_none()
        {
            return Err(AppError::Unsupported(
                "无法读取账户信息，可改用已有 API Key".into(),
            ));
        }
        Ok(profile.clone())
    }

    /// Stable desktop account contract. KunCode (new-api) serves this from
    /// `/api/desktop/profile`; other compatible providers may implement the
    /// same shape. Returns the raw object envelope from the site.
    pub fn desktop_profile(&self, site: &str, token: &str) -> AppResult<Value> {
        self.request(
            reqwest::Method::GET,
            &format!("{site}/api/desktop/profile"),
            Some(token),
            None,
            None,
        )
    }
    /// Public site metadata. Used only for display preferences such as the
    /// quota unit; a failure must never block the account profile itself.
    pub fn status(&self, site: &str) -> AppResult<Value> {
        let response = self.request(
            reqwest::Method::GET,
            &format!("{site}/api/status"),
            None,
            None,
            None,
        )?;
        response
            .get("data")
            .filter(|value| value.is_object())
            .cloned()
            .ok_or_else(|| AppError::Unsupported("该站点不提供站点信息".into()))
    }
    pub fn models(
        &self,
        base: &str,
        secret: &str,
        user_id: Option<i64>,
        management: bool,
        default_group: Option<&str>,
    ) -> AppResult<Vec<String>> {
        let mut url = reqwest::Url::parse(&format!(
            "{base}/{}",
            if management {
                "api/user/models"
            } else {
                "models"
            }
        ))
        .map_err(|_| AppError::Other("站点地址无效".into()))?;
        if let Some(group) = default_group {
            url.query_pairs_mut().append_pair("group", group);
        }
        let response = self.request(
            reqwest::Method::GET,
            url.as_str(),
            Some(secret),
            user_id,
            None,
        )?;
        let data = response
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                AppError::Unsupported("该站点无法提供模型列表，请手动填写模型".into())
            })?;
        let mut models: Vec<String> = data
            .iter()
            .filter_map(|item| {
                item.as_str()
                    .or_else(|| item.get("id").and_then(Value::as_str))
            })
            .map(str::to_owned)
            .collect();
        models.sort();
        models.dedup();
        Ok(models)
    }

    // Never automatically replay this POST. For older responses, locate only
    // the unique record created by this operation before revealing its key.
    pub fn create_tool_key(
        &self,
        site: &str,
        token: &str,
        user_id: Option<i64>,
        name: &str,
        resume_only: bool,
    ) -> AppResult<(i64, String)> {
        let created = if resume_only {
            json!({})
        } else {
            self.request(reqwest::Method::POST, &format!("{site}/api/token/"), Some(token), user_id,
                Some(json!({"name":name,"unlimited_quota":true,"expired_time":-1,"model_limits_enabled":false,"group":""})))
                .map_err(|error| match error {
                    AppError::Auth(_) | AppError::Unsupported(_) => error,
                    _ => AppError::Other("无法确认密钥创建结果，不会重复创建；请重试核对结果或改用已有 API Key".into()),
                })?
        };
        if let Some(data) = created.get("data") {
            if let (Some(id), Some(key)) = (
                data.get("id").and_then(Value::as_i64),
                data.get("key").and_then(Value::as_str),
            ) {
                if id > 0 && !key.is_empty() && !key.contains('*') {
                    return Ok((id, model_key(key)?));
                }
            }
            if let Some(id) = data.get("id").and_then(Value::as_i64).filter(|id| *id > 0) {
                return Ok((id, self.read_tool_key(site, token, user_id, id)?));
            }
        }
        let mut search_url = reqwest::Url::parse(&format!("{site}/api/token/search")).unwrap();
        search_url.query_pairs_mut().append_pair("keyword", name);
        let search = self.request(
            reqwest::Method::GET,
            search_url.as_str(),
            Some(token),
            user_id,
            None,
        )?;
        let data = search.get("data").ok_or_else(|| {
            AppError::Unsupported("无法确认密钥创建结果，请在站点查看，或改用已有 API Key".into())
        })?;
        let rows = data
            .as_array()
            .or_else(|| data.get("items").and_then(Value::as_array))
            .ok_or_else(|| {
                AppError::Unsupported(
                    "无法确认密钥创建结果，请在站点查看，或改用已有 API Key".into(),
                )
            })?;
        let matches: Vec<&Value> = rows
            .iter()
            .filter(|row| row.get("name").and_then(Value::as_str) == Some(name))
            .collect();
        if matches.len() != 1 {
            return Err(AppError::Unsupported(
                "无法确认密钥创建结果，不会重复创建；请在站点查看".into(),
            ));
        }
        let row = matches[0];
        let id = row
            .get("id")
            .and_then(Value::as_i64)
            .filter(|id| *id > 0)
            .ok_or_else(|| {
                AppError::Unsupported("密钥创建结果不兼容，请改用已有 API Key".into())
            })?;
        if let Some(key) = row
            .get("key")
            .and_then(Value::as_str)
            .filter(|key| !key.is_empty() && !key.contains('*'))
        {
            return Ok((id, model_key(key)?));
        }
        Ok((id, self.read_tool_key(site, token, user_id, id)?))
    }

    /// Lists the caller's site keys (masked). Works for desktop-authorized
    /// connections via `/api/desktop/keys`; falls back to the dashboard token
    /// list for user-token connections.
    pub fn list_site_tokens(&self, connection: &SiteConnection<'_>) -> AppResult<Vec<SiteToken>> {
        let (path, user_id) = if connection.desktop {
            (format!("{}/api/desktop/keys", connection.site), None)
        } else {
            (
                format!("{}/api/token/", connection.site),
                connection.user_id,
            )
        };
        let response = self.request(
            reqwest::Method::GET,
            &path,
            Some(connection.secret),
            user_id,
            None,
        )?;
        let data = response.get("data").ok_or_else(|| {
            AppError::Unsupported("该站点无法提供密钥列表，可改用已有 API Key".into())
        })?;
        let rows = data
            .get("items")
            .and_then(Value::as_array)
            .or_else(|| data.as_array())
            .ok_or_else(|| {
                AppError::Unsupported("该站点无法提供密钥列表，可改用已有 API Key".into())
            })?;
        Ok(rows.iter().map(site_token_from_value).collect())
    }

    /// Reveals one key's plaintext for writing into a coding tool config.
    pub fn reveal_site_token(
        &self,
        connection: &SiteConnection<'_>,
        token_id: i64,
    ) -> AppResult<String> {
        let (path, user_id) = if connection.desktop {
            (
                format!("{}/api/desktop/keys/{token_id}/reveal", connection.site),
                None,
            )
        } else {
            (
                format!("{}/api/token/{token_id}/key", connection.site),
                connection.user_id,
            )
        };
        let response = self.request(
            reqwest::Method::POST,
            &path,
            Some(connection.secret),
            user_id,
            None,
        )?;
        let key = response
            .get("data")
            .and_then(|value| value.get("key"))
            .and_then(Value::as_str)
            .filter(|key| !key.is_empty() && !key.contains('*'))
            .ok_or_else(|| AppError::Unsupported("无法读取所选密钥，请改用已有 API Key".into()))?;
        model_key(key)
    }

    /// Creates a new site key, returning its id and plaintext (once).
    pub fn create_site_token(
        &self,
        connection: &SiteConnection<'_>,
        name: &str,
        group: &str,
        model_limits: &[String],
    ) -> AppResult<(i64, String)> {
        let body = json!({
            "name": name,
            "group": group,
            "model_limits": model_limits,
            "unlimited_quota": true,
            "expired_time": -1,
        });
        let response = self.request(
            reqwest::Method::POST,
            &format!("{}/api/desktop/keys", connection.site),
            Some(connection.secret),
            None,
            Some(body),
        )?;
        let data = response
            .get("data")
            .ok_or_else(|| AppError::Other("无法获取新建密钥结果".into()))?;
        let id = data
            .get("id")
            .and_then(Value::as_i64)
            .filter(|id| *id > 0)
            .ok_or_else(|| AppError::Other("无法获取新建密钥结果".into()))?;
        let key = data
            .get("key")
            .and_then(Value::as_str)
            .filter(|key| !key.is_empty() && !key.contains('*'))
            .ok_or_else(|| AppError::Other("无法获取新建密钥结果".into()))?;
        Ok((id, model_key(key)?))
    }

    /// Updates name, group, and model limits of one site key.
    pub fn update_site_token(
        &self,
        connection: &SiteConnection<'_>,
        token_id: i64,
        name: &str,
        group: &str,
        model_limits: &[String],
    ) -> AppResult<()> {
        self.request(
            reqwest::Method::PUT,
            &format!("{}/api/desktop/keys/{token_id}", connection.site),
            Some(connection.secret),
            None,
            Some(json!({"name": name, "group": group, "model_limits": model_limits})),
        )?;
        Ok(())
    }

    /// Deletes one site key. The server refuses when a tool still binds it.
    pub fn delete_site_token(
        &self,
        connection: &SiteConnection<'_>,
        token_id: i64,
    ) -> AppResult<()> {
        self.request(
            reqwest::Method::DELETE,
            &format!("{}/api/desktop/keys/{token_id}", connection.site),
            Some(connection.secret),
            None,
            None,
        )?;
        Ok(())
    }

    /// Lists the groups the account may choose, with display metadata.
    pub fn user_groups(&self, connection: &SiteConnection<'_>) -> AppResult<Vec<SiteGroup>> {
        let response = self.request(
            reqwest::Method::GET,
            &format!("{}/api/user/self/groups", connection.site),
            Some(connection.secret),
            connection.user_id,
            None,
        )?;
        let data = response.get("data").ok_or_else(|| {
            AppError::Unsupported("该站点无法提供分组信息，可改用已有 API Key".into())
        })?;
        let mut groups = Vec::new();
        if let Some(map) = data.as_object() {
            for (name, value) in map {
                groups.push(SiteGroup {
                    name: name.clone(),
                    description: value.get("desc").and_then(Value::as_str).map(str::to_owned),
                    ratio: value.get("ratio").cloned(),
                });
            }
        }
        groups.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(groups)
    }

    /// Lists the models a chosen group enables.
    pub fn group_models(
        &self,
        connection: &SiteConnection<'_>,
        group: &str,
    ) -> AppResult<Vec<String>> {
        let mut url = reqwest::Url::parse(&format!("{}/api/user/models", connection.site))
            .map_err(|_| AppError::Other("站点地址无效".into()))?;
        url.query_pairs_mut().append_pair("group", group);
        let response = self.request(
            reqwest::Method::GET,
            url.as_str(),
            Some(connection.secret),
            connection.user_id,
            None,
        )?;
        let data = response
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| AppError::Unsupported("该站点无法提供分组模型列表".into()))?;
        let mut models: Vec<String> = data
            .iter()
            .filter_map(|item| {
                item.as_str()
                    .or_else(|| item.get("id").and_then(Value::as_str))
            })
            .map(str::to_owned)
            .collect();
        models.sort();
        models.dedup();
        Ok(models)
    }

    pub fn read_tool_key(
        &self,
        site: &str,
        token: &str,
        user_id: Option<i64>,
        id: i64,
    ) -> AppResult<String> {
        let revealed = self.request(
            reqwest::Method::POST,
            &format!("{site}/api/token/{id}/key"),
            Some(token),
            user_id,
            None,
        )?;
        let key = revealed
            .get("data")
            .and_then(|v| v.get("key"))
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty() && !v.contains('*'))
            .ok_or_else(|| {
                AppError::Unsupported("无法读取本次创建的密钥，请改用已有 API Key".into())
            })?;
        model_key(key)
    }
}

/// Request context for site-level key management. `desktop` selects the
/// desktop-authorized routes (`/api/desktop/*`) over the dashboard token API.
pub struct SiteConnection<'a> {
    pub site: &'a str,
    pub secret: &'a str,
    pub user_id: Option<i64>,
    pub desktop: bool,
}

/// One site key as shown in the key center. The plaintext key is never part of
/// this projection.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteToken {
    pub id: i64,
    pub name: String,
    pub masked_key: String,
    pub group: String,
    pub status: i64,
    pub unlimited_quota: bool,
    pub remain_quota: f64,
    pub used_quota: f64,
    pub expired_time: i64,
    pub accessed_time: i64,
    pub model_limits_enabled: bool,
    pub model_limits: Vec<String>,
    pub bound_agents: Vec<String>,
}

/// One selectable group with its display metadata.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteGroup {
    pub name: String,
    pub description: Option<String>,
    pub ratio: Option<Value>,
}

fn number(value: Option<&Value>) -> f64 {
    value
        .and_then(|value| value.as_f64().or_else(|| value.as_i64().map(|v| v as f64)))
        .unwrap_or(0.0)
}

fn text(value: Option<&Value>) -> String {
    value.and_then(Value::as_str).unwrap_or_default().to_owned()
}

/// Normalizes a token row from either the desktop key API or the dashboard
/// token list. The dashboard returns `key` (masked) and a `model_limits` map;
/// the desktop API returns `masked_key` and a `model_limits` array.
fn site_token_from_value(row: &Value) -> SiteToken {
    let masked_key = row
        .get("masked_key")
        .and_then(Value::as_str)
        .or_else(|| row.get("key").and_then(Value::as_str))
        .unwrap_or_default()
        .to_owned();
    let model_limits = match row.get("model_limits") {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        Some(Value::Object(map)) => map.keys().cloned().collect(),
        _ => Vec::new(),
    };
    let bound_agents = row
        .get("bound_agents")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    SiteToken {
        id: row.get("id").and_then(Value::as_i64).unwrap_or(0),
        name: text(row.get("name")),
        masked_key,
        group: text(row.get("group")),
        status: row.get("status").and_then(Value::as_i64).unwrap_or(0),
        unlimited_quota: row
            .get("unlimited_quota")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        remain_quota: number(row.get("remain_quota")),
        used_quota: number(row.get("used_quota")),
        expired_time: row
            .get("expired_time")
            .and_then(Value::as_i64)
            .unwrap_or(-1),
        accessed_time: row
            .get("accessed_time")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        model_limits_enabled: row
            .get("model_limits_enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        model_limits,
        bound_agents,
    }
}

fn model_key(key: &str) -> AppResult<String> {
    if key.trim().is_empty() || key.contains(['*', '•', '…', '\r', '\n']) {
        return Err(AppError::Unsupported(
            "密钥返回值不完整，请改用已有 API Key".into(),
        ));
    }
    Ok(if key.starts_with("sk-") {
        key.into()
    } else {
        format!("sk-{key}")
    })
}
