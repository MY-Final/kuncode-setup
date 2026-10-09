use keyring::Entry;
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};

// Bind each vault entry to its destination URL, so changing non-secret local
// metadata cannot forward a previously stored credential to another site.
pub fn reference(scope: &str, id: &str, destination: &str) -> String {
    let hash = Sha256::digest(destination.as_bytes());
    format!("{scope}/{id}/{hash:x}")
}

fn entry(reference: &str) -> AppResult<Entry> {
    Entry::new("KunCode Setup", reference)
        .map_err(|_| AppError::Other("无法访问 Windows 凭据管理器".into()))
}

pub fn put(reference: &str, secret: &str) -> AppResult<()> {
    entry(reference)?
        .set_password(secret)
        .map_err(|_| AppError::Other("无法安全保存连接凭据".into()))
}

pub fn get(reference: &str) -> AppResult<String> {
    get_optional(reference)?.ok_or_else(|| AppError::Auth("此连接需要重新登录或提供凭据".into()))
}

pub fn get_optional(reference: &str) -> AppResult<Option<String>> {
    match entry(reference)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(AppError::Other(
            "无法读取 Windows 凭据管理器，操作未继续".into(),
        )),
    }
}

pub fn restore(reference: &str, secret: Option<&str>) -> AppResult<()> {
    match secret {
        Some(secret) => put(reference, secret),
        None => delete(reference),
    }
}

pub fn delete(reference: &str) -> AppResult<()> {
    match entry(reference)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(AppError::Other("无法清理本机连接凭据".into())),
    }
}
