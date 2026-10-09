use std::path::{Path, PathBuf};

#[cfg(test)]
use chrono::Local;

use crate::error::{AppError, AppResult};

/// 备份时间戳，例如 20261007-153012。
#[cfg(test)]
pub fn timestamp() -> String {
    Local::now().format("%Y%m%d-%H%M%S-%f").to_string()
}

pub fn atomic_write(path: &Path, body: &str) -> AppResult<()> {
    atomic_write_bytes(path, body.as_bytes())
}

pub fn atomic_write_bytes(path: &Path, body: &[u8]) -> AppResult<()> {
    ensure_parent(path)?;
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4().simple()));
    std::fs::write(&temporary, body)?;
    if let Err(error) = std::fs::rename(&temporary, path) {
        let _ = std::fs::remove_file(temporary);
        return Err(error.into());
    }
    Ok(())
}

/// A missing file is different from an unreadable or malformed existing file.
pub fn read_json_object(path: &Path) -> AppResult<serde_json::Value> {
    let value = match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).map_err(|_| {
            AppError::Parse(format!(
                "{} 无法解析，原文件未修改；请先修复或恢复备份",
                path.display()
            ))
        })?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => serde_json::json!({}),
        Err(error) => return Err(error.into()),
    };
    if !value.is_object() {
        return Err(AppError::Parse(format!(
            "{} 必须是 JSON 对象，原文件未修改",
            path.display()
        )));
    }
    Ok(value)
}

pub fn read_toml_table(path: &Path) -> AppResult<toml::Value> {
    match std::fs::read_to_string(path) {
        Ok(text) => toml::from_str(&text).map_err(|_| {
            AppError::Parse(format!(
                "{} 无法解析，原文件未修改；请先修复或恢复备份",
                path.display()
            ))
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(toml::Value::Table(Default::default()))
        }
        Err(error) => Err(error.into()),
    }
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct BackupFile {
    pub original: PathBuf,
    /// None means this file did not exist before the operation.
    pub backup: Option<PathBuf>,
}

pub struct FileSnapshot {
    pub path: PathBuf,
    pub bytes: Option<Vec<u8>>,
}

pub fn capture_files(paths: &[PathBuf]) -> AppResult<Vec<FileSnapshot>> {
    paths
        .iter()
        .map(|path| {
            let bytes = match std::fs::read(path) {
                Ok(bytes) => Some(bytes),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                Err(error) => return Err(error.into()),
            };
            Ok(FileSnapshot {
                path: path.clone(),
                bytes,
            })
        })
        .collect()
}

/// Prepare every member before changing any file. Rollback attempts all members.
pub fn restore_snapshots(files: &[FileSnapshot]) -> AppResult<()> {
    let mut failed = Vec::new();
    for file in files {
        let result = match &file.bytes {
            Some(bytes) => atomic_write_bytes(&file.path, bytes),
            None => match std::fs::remove_file(&file.path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(error) => Err(error.into()),
            },
        };
        if result.is_err() {
            failed.push(file.path.display().to_string());
        }
    }
    if failed.is_empty() {
        Ok(())
    } else {
        Err(AppError::Io(format!(
            "无法恢复以下文件：{}；请保留备份并重试",
            failed.join("、")
        )))
    }
}

pub fn backup_snapshots(files: &[FileSnapshot]) -> AppResult<Vec<BackupFile>> {
    let batch = uuid::Uuid::new_v4().simple().to_string();
    let mut backups = Vec::new();
    for file in files {
        let backup = file.bytes.as_ref().map(|_| {
            let mut name = file.path.as_os_str().to_os_string();
            name.push(format!(".kuncode.bak.{batch}"));
            PathBuf::from(name)
        });
        if let (Some(path), Some(bytes)) = (&backup, &file.bytes) {
            if let Err(error) = atomic_write_bytes(path, bytes) {
                discard_backups(&backups);
                return Err(error);
            }
        }
        backups.push(BackupFile {
            original: file.path.clone(),
            backup,
        });
    }
    Ok(backups)
}

pub fn discard_backups(files: &[BackupFile]) {
    for file in files {
        if let Some(path) = &file.backup {
            let _ = std::fs::remove_file(path);
        }
    }
}

pub fn load_backup_set(files: &[BackupFile], expected: &[PathBuf]) -> AppResult<Vec<FileSnapshot>> {
    if files.len() != expected.len()
        || !expected
            .iter()
            .all(|path| files.iter().filter(|file| &file.original == path).count() == 1)
    {
        return Err(AppError::Parse(
            "备份清单不完整或配置路径已变化，未恢复任何文件".into(),
        ));
    }
    files
        .iter()
        .map(|file| {
            let bytes = match &file.backup {
                Some(path) => Some(std::fs::read(path).map_err(|_| {
                    AppError::Io(format!(
                        "备份文件无法读取：{}，未恢复任何文件",
                        path.display()
                    ))
                })?),
                None => None,
            };
            Ok(FileSnapshot {
                path: file.original.clone(),
                bytes,
            })
        })
        .collect()
}

/// 为某个配置文件生成备份路径：<name>.kuncode.bak
pub fn backup_path_for(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".kuncode.bak");
    path.with_file_name(name)
}

/// 备份已存在的文件。若原文件不存在则返回 None（无需备份）。
/// 已存在同名备份时，会自动追加时间戳避免覆盖。
#[cfg(test)]
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
#[cfg(test)]
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
