use std::path::{Path, PathBuf};

use chrono::Local;

use crate::error::{AppError, AppResult};

/// 备份时间戳，例如 20261007-153012。
pub fn timestamp() -> String {
    Local::now().format("%Y%m%d-%H%M%S-%f").to_string()
}

pub fn atomic_write(path: &Path, body: &str) -> AppResult<()> {
    ensure_parent(path)?;
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4().simple()));
    std::fs::write(&temporary, body)?;
    if let Err(error) = std::fs::rename(&temporary, path) {
        let _ = std::fs::remove_file(temporary);
        return Err(error.into());
    }
    Ok(())
}

/// 为某个配置文件生成备份路径：<name>.kuncode.bak
pub fn backup_path_for(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".kuncode.bak");
    path.with_file_name(name)
}

/// 备份已存在的文件。若原文件不存在则返回 None（无需备份）。
/// 已存在同名备份时，会自动追加时间戳避免覆盖。
pub fn backup_file(path: &Path) -> AppResult<Option<PathBuf>> {
    if !path.exists() {
        return Ok(None);
    }

    let mut target = backup_path_for(path);
    if target.exists() {
        let stamped = format!("{}.{}", target.to_string_lossy(), timestamp());
        target = PathBuf::from(stamped);
    }

    std::fs::copy(path, &target).map_err(|e| {
        AppError::Io(format!(
            "备份失败：{} -> {} ({e})",
            path.display(),
            target.display()
        ))
    })?;

    Ok(Some(target))
}

/// 从备份恢复。
#[allow(dead_code)]
pub fn restore_file(backup: &Path, original: &Path) -> AppResult<()> {
    if !backup.exists() {
        return Err(AppError::NotFound(format!("备份文件 {}", backup.display())));
    }
    std::fs::copy(backup, original).map_err(|e| {
        AppError::Io(format!(
            "恢复失败：{} -> {} ({e})",
            backup.display(),
            original.display()
        ))
    })?;
    Ok(())
}

/// 确保父目录存在。
pub fn ensure_parent(path: &Path) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::Io(format!("创建目录失败：{} ({e})", parent.display())))?;
        }
    }
    Ok(())
}
