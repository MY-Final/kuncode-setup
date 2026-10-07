use std::process::Command;

use crate::error::{AppError, AppResult};

/// 启动一个 CLI 工具（分离子进程，不阻塞 UI）。
/// 返回一个人类可读的说明。
pub fn spawn(program: &str, args: &[&str]) -> AppResult<String> {
    let mut cmd = Command::new(program);
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
