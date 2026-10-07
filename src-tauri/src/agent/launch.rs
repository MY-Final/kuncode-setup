use std::path::PathBuf;
use std::process::Command;

use crate::error::{AppError, AppResult};

/// 把命令名解析为可执行文件的绝对路径。
///
/// Windows 上 npm 安装的 CLI（如 `opencode`）只有 `opencode.cmd`，
/// `CreateProcess` 不会查找 `PATHEXT`，直接以裸命令名启动会失败。
/// 优先使用 `which` 定位，失败时退回原始名称交给系统解析。
pub(crate) fn resolve(program: &str) -> PathBuf {
    which::which(program).unwrap_or_else(|_| PathBuf::from(program))
}

/// 启动一个 CLI 工具（分离子进程，不阻塞 UI）。
/// 返回一个人类可读的说明。
pub fn spawn(program: &str, args: &[&str]) -> AppResult<String> {
    let mut cmd = Command::new(resolve(program));
    cmd.args(args);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        cmd.creation_flags(CREATE_NEW_CONSOLE);
    }

    match cmd.spawn() {
        Ok(child) => Ok(format!("已启动 {}（PID {}）", program, child.id())),
        Err(e) => Err(AppError::Command(format!("启动 {program} 失败：{e}"))),
    }
}
