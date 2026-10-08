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

/// 找到某个配置文件最近的备份：`<name>.kuncode.bak` 或带时间戳的变体。
/// 返回 None 表示没有可用备份。
pub fn latest_backup(path: &Path) -> AppResult<Option<PathBuf>> {
    let base = backup_path_for(path);
    let Some(dir) = base.parent() else {
        return Ok(None);
    };
    if !dir.exists() {
        return Ok(None);
    }
    let name = base
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();
    let prefix = format!("{name}.");
    let mut candidates: Vec<PathBuf> = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name == name || file_name.starts_with(&prefix) {
            candidates.push(entry.path());
        }
    }
    // 优先最近修改的备份，时间相同再按名称（时间戳）倒序。
    candidates.sort_by(|a, b| {
        let left = a.metadata().and_then(|meta| meta.modified()).ok();
        let right = b.metadata().and_then(|meta| meta.modified()).ok();
        right.cmp(&left).then_with(|| b.cmp(a))
    });
    Ok(candidates.into_iter().next())
}

/// 从备份恢复。
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latest_backup_prefers_newest_and_restore_round_trips() {
        let dir =
            std::env::temp_dir().join(format!("kuncode-config-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let original = dir.join("config.toml");
        std::fs::write(&original, "current").unwrap();

        // 没有备份时返回 None。
        assert!(latest_backup(&original).unwrap().is_none());

        // 生成一份备份，再修改原文件，恢复后应回到备份内容。
        let backup = backup_file(&original).unwrap().unwrap();
        std::fs::write(&original, "changed").unwrap();
        let found = latest_backup(&original).unwrap().unwrap();
        assert_eq!(found, backup);
        restore_file(&found, &original).unwrap();
        assert_eq!(std::fs::read_to_string(&original).unwrap(), "current");

        // 再次备份会落到带时间戳的文件，latest_backup 仍能找到它。
        std::fs::write(&original, "newest").unwrap();
        let second = backup_file(&original).unwrap().unwrap();
        assert_ne!(second, backup);
        let latest = latest_backup(&original).unwrap().unwrap();
        assert_eq!(latest, second);
        restore_file(&latest, &original).unwrap();
        assert_eq!(std::fs::read_to_string(&original).unwrap(), "newest");

        std::fs::remove_dir_all(dir).unwrap();
    }
}
