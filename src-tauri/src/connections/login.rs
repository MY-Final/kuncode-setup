use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, RngCore};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tauri::ipc::Channel;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use super::{
    http::SiteClient, ConnectionKind, ConnectionService, ConnectionStep, ConnectionSummary,
};
use crate::error::{AppError, AppResult};

fn random_parameter() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub(super) fn authorization_url(raw: &str, site: &str) -> AppResult<reqwest::Url> {
    let url = reqwest::Url::parse(raw).map_err(|_| AppError::Auth("授权地址无效".into()))?;
    let expected = reqwest::Url::parse(&format!("{site}/desktop/authorize"))
        .map_err(|_| AppError::Auth("授权服务地址无效".into()))?;
    if url.origin() != expected.origin()
        || url.path() != expected.path()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err(AppError::Auth(
            "返回的授权地址与设置中的服务地址不一致；请检查站点 ServerAddress".into(),
        ));
    }
    Ok(url)
}

pub(super) fn callback_result(target: &str, port: u16, state: &str) -> AppResult<Option<String>> {
    if !target.starts_with("/callback?") {
        return Ok(None);
    }
    let url = reqwest::Url::parse(&format!("http://127.0.0.1:{port}{target}"))
        .map_err(|_| AppError::Auth("无效的授权回调".into()))?;
    if url.path() != "/callback" || url.fragment().is_some() {
        return Ok(None);
    }
    let pairs: Vec<_> = url.query_pairs().collect();
    let states: Vec<_> = pairs.iter().filter(|(name, _)| name == "state").collect();
    if states.len() != 1 || !bool::from(states[0].1.as_bytes().ct_eq(state.as_bytes())) {
        return Ok(None);
    }
    if pairs
        .iter()
        .any(|(name, value)| name == "error" && value == "access_denied")
    {
        return Err(AppError::Cancelled);
    }
    let codes: Vec<_> = pairs.iter().filter(|(name, _)| name == "code").collect();
    if codes.len() != 1 || codes[0].1.len() < 32 || codes[0].1.len() > 128 {
        return Ok(None);
    }
    Ok(Some(codes[0].1.to_string()))
}

fn receive_callback(stream: &mut TcpStream, port: u16, state: &str) -> AppResult<Option<String>> {
    stream.set_read_timeout(Some(Duration::from_millis(500)))?;
    stream.set_write_timeout(Some(Duration::from_millis(500)))?;
    let mut request = Vec::new();
    let mut chunk = [0u8; 1024];
    while request.len() < 8192 && !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
        let count = match stream.read(&mut chunk) {
            Ok(count) => count,
            Err(_) => return Ok(None),
        };
        if count == 0 {
            return Ok(None);
        }
        request.extend_from_slice(&chunk[..count]);
    }
    let text = String::from_utf8_lossy(&request);
    let mut words = text.lines().next().unwrap_or_default().split_whitespace();
    let result = if words.next() == Some("GET") {
        callback_result(words.next().unwrap_or_default(), port, state)
    } else {
        Ok(None)
    };
    let accepted = matches!(result, Ok(Some(_)) | Err(AppError::Cancelled));
    let body = if accepted {
        "Authorization received. You can close this tab and return to KunCode Setup."
    } else {
        "Invalid callback."
    };
    // Never reflect callback parameters or credentials into this page.
    let response = format!("HTTP/1.1 {}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n{body}", if accepted { "200 OK" } else { "400 Bad Request" }, body.len());
    let _ = stream.write_all(response.as_bytes());
    result
}

impl ConnectionService {
    pub fn cancel_login(&self, attempt_id: &str) -> AppResult<()> {
        let attempt = self
            .attempt
            .lock()
            .map_err(|_| AppError::Other("登录状态暂不可用".into()))?;
        if attempt.as_ref().is_some_and(|(id, _)| id == attempt_id) {
            if let Some((_, cancelled)) = attempt.as_ref() {
                cancelled.store(true, Ordering::SeqCst);
            }
        } else {
            Uuid::parse_str(attempt_id).map_err(|_| AppError::Other("无效的登录请求".into()))?;
            let mut cancelled = self
                .cancelled_attempts
                .lock()
                .map_err(|_| AppError::Other("登录状态暂不可用".into()))?;
            if cancelled.len() >= 32 {
                cancelled.remove(0);
            }
            cancelled.push(attempt_id.into());
        }
        Ok(())
    }

    pub(super) fn begin_login(&self, attempt_id: &str) -> AppResult<Arc<AtomicBool>> {
        Uuid::parse_str(attempt_id).map_err(|_| AppError::Other("无效的登录请求".into()))?;
        let cancelled = Arc::new(AtomicBool::new(false));
        {
            let mut attempt = self
                .attempt
                .lock()
                .map_err(|_| AppError::Other("登录状态暂不可用".into()))?;
            let mut earlier_cancellations = self
                .cancelled_attempts
                .lock()
                .map_err(|_| AppError::Other("登录状态暂不可用".into()))?;
            if let Some(index) = earlier_cancellations.iter().position(|id| id == attempt_id) {
                earlier_cancellations.remove(index);
                return Err(AppError::Cancelled);
            }
            if attempt.is_some() {
                return Err(AppError::Other("已有登录请求正在进行".into()));
            }
            *attempt = Some((attempt_id.into(), cancelled.clone()));
        }
        Ok(cancelled)
    }

    pub fn login(
        &self,
        app: &tauri::AppHandle,
        attempt_id: &str,
        progress: &Channel<ConnectionStep>,
    ) -> AppResult<ConnectionSummary> {
        let cancelled = self.begin_login(attempt_id)?;
        let result = self.login_inner(app, progress, &cancelled);
        let mut attempt = self
            .attempt
            .lock()
            .map_err(|_| AppError::Other("登录状态暂不可用".into()))?;
        let current = attempt.as_ref().is_some_and(|(id, _)| id == attempt_id);
        if !current || cancelled.load(Ordering::SeqCst) {
            if current {
                *attempt = None;
            }
            drop(attempt);
            if let Ok((connection, token)) = result {
                let _ = SiteClient::new()?.request(
                    reqwest::Method::POST,
                    &format!("{}/api/desktop/auth/logout", connection.site_url),
                    Some(&token),
                    None,
                    None,
                );
            }
            return Err(AppError::Cancelled);
        }
        // Keep this lock through saving so a cancel cannot race the final commit.
        let stored =
            result.and_then(|(connection, token)| self.store_connection(connection, &token));
        *attempt = None;
        stored
    }

    fn login_inner(
        &self,
        app: &tauri::AppHandle,
        progress: &Channel<ConnectionStep>,
        cancelled: &AtomicBool,
    ) -> AppResult<(ConnectionSummary, String)> {
        let emit = |step: &str, status: &str| {
            let _ = progress.send(ConnectionStep {
                step: step.into(),
                status: status.into(),
                detail: None,
            });
        };
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        listener.set_nonblocking(true)?;
        let port = listener.local_addr()?.port();
        let redirect = format!("http://127.0.0.1:{port}/callback");
        let state = random_parameter();
        let verifier = random_parameter();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let client = SiteClient::new()?;
        let site = self.authorization_site()?;
        let started = Instant::now();
        emit("准备浏览器授权", "running");
        let response = client.request(reqwest::Method::POST, &format!("{site}/api/desktop/auth/start"), None, None,
            Some(json!({"client_id":"kuncode-setup", "installation_id": self.installation_id()?, "device_name":"Windows 桌面", "redirect_uri":redirect, "state":state, "code_challenge":challenge, "code_challenge_method":"S256"})))
            .map_err(|error| match error { AppError::Unsupported(_) => AppError::Unsupported("KunCode 浏览器授权服务尚未上线，请先使用「连接其他站点」".into()), other => other })?;
        if cancelled.load(Ordering::SeqCst) {
            return Err(AppError::Cancelled);
        }
        let raw_url = response
            .pointer("/data/authorization_url")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                AppError::Unsupported("KunCode 授权服务响应不兼容，请使用手动连接".into())
            })?;
        let url = authorization_url(raw_url, &site)?;
        app.opener()
            .open_url(url.as_str(), None::<&str>)
            .map_err(|_| AppError::Other("无法打开系统浏览器，请检查默认浏览器".into()))?;
        emit("准备浏览器授权", "complete");
        emit("等待在浏览器中确认", "running");
        let code = loop {
            if cancelled.load(Ordering::SeqCst) {
                return Err(AppError::Cancelled);
            }
            if started.elapsed() >= Duration::from_secs(300) {
                return Err(AppError::Other("授权已超时，请重新登录".into()));
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    if let Some(code) = receive_callback(&mut stream, port, &state)? {
                        break code;
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(100))
                }
                Err(_) => return Err(AppError::Other("无法接收浏览器授权回调".into())),
            }
        };
        drop(listener);
        if cancelled.load(Ordering::SeqCst) {
            return Err(AppError::Cancelled);
        }
        emit("等待在浏览器中确认", "complete");
        emit("保存安全连接", "running");
        let exchange = client.request(
            reqwest::Method::POST,
            &format!("{site}/api/desktop/auth/exchange"),
            None,
            None,
            Some(json!({"code":code, "code_verifier":verifier, "redirect_uri":redirect})),
        )?;
        let data = exchange
            .get("data")
            .ok_or_else(|| AppError::Auth("授权交换失败，请重新登录".into()))?;
        let token = data
            .get("token")
            .and_then(Value::as_str)
            .filter(|token| token.starts_with("nap_"))
            .ok_or_else(|| AppError::Auth("授权交换失败，请重新登录".into()))?
            .to_owned();
        let profile = match client.profile(&site, &token, None) {
            Ok(profile) => profile,
            Err(error) => {
                let _ = client.request(
                    reqwest::Method::POST,
                    &format!("{site}/api/desktop/auth/logout"),
                    Some(&token),
                    None,
                    None,
                );
                return Err(error);
            }
        };
        let connection = ConnectionSummary {
            id: Uuid::new_v4().to_string(),
            kind: ConnectionKind::KuncodeAuthorized,
            site_url: site.clone(),
            api_base_url: format!("{site}/v1"),
            account: profile
                .get("display_name")
                .and_then(Value::as_str)
                .filter(|name| !name.is_empty())
                .or_else(|| profile.get("username").and_then(Value::as_str))
                .map(str::to_owned),
            alias: None,
            note: None,
            user_id: profile.get("id").and_then(Value::as_i64),
            legacy_user_id: None,
            expires_at: data.get("expires_at").and_then(Value::as_i64),
            connected: true,
            verified: true,
        };
        emit("保存安全连接", "complete");
        Ok((connection, token))
    }
}
