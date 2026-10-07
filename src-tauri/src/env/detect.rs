use crate::env::ToolStatus;

/// 运行一个命令并返回 (stdout, success)。
fn run_capture(program: &str, args: &[&str]) -> Option<String> {
    // Windows 上 npm 等 CLI 只有 .cmd 包装脚本，必须使用解析后的绝对路径。
    let target = which::which(program).unwrap_or_else(|_| std::path::PathBuf::from(program));
    let mut cmd = std::process::Command::new(target);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn first_line(text: &str) -> String {
    text.lines().next().unwrap_or("").trim().to_string()
}

/// 定位可执行文件，返回其绝对路径。
pub fn locate(program: &str) -> Option<String> {
    which::which(program)
        .ok()
        .map(|p| p.to_string_lossy().to_string())
}

/// 检测一个 CLI 工具的版本与路径。
///
/// `program` 用于 which 定位和实际执行，`version_args` 是获取版本的参数，
/// `id` / `name` 用于结果展示。
pub fn detect_cli(id: &str, name: &str, program: &str, version_args: &[&str]) -> ToolStatus {
    let path = locate(program);
    match path {
        Some(p) => {
            let raw = run_capture(program, version_args).unwrap_or_default();
            ToolStatus {
                id: id.to_string(),
                name: name.to_string(),
                installed: true,
                version: if raw.is_empty() {
                    None
                } else {
                    Some(first_line(&raw))
                },
                path: Some(p),
            }
        }
        None => ToolStatus::missing(id, name),
    }
}

pub fn detect_os() -> String {
    let name = std::env::consts::OS;
    match name {
        "windows" => {
            let build = run_capture("cmd", &["/C", "ver"]).unwrap_or_default();
            let label = if build.contains("11") {
                "Windows 11"
            } else if build.contains("10") {
                "Windows 10"
            } else {
                "Windows"
            };
            label.to_string()
        }
        "macos" => "macOS".to_string(),
        "linux" => "Linux".to_string(),
        other => other.to_string(),
    }
}

pub fn detect_arch() -> String {
    std::env::consts::ARCH.to_string()
}

/// 检测 Node.js。
pub fn detect_node() -> ToolStatus {
    detect_cli("node", "Node.js", "node", &["--version"])
}

/// 检测 npm。
pub fn detect_npm() -> ToolStatus {
    detect_cli("npm", "npm", "npm", &["--version"])
}

/// 检测 Git。
pub fn detect_git() -> ToolStatus {
    detect_cli("git", "Git", "git", &["--version"])
}

/// 汇总所有通用环境检测项。
pub fn detect_common() -> Vec<ToolStatus> {
    vec![detect_node(), detect_npm(), detect_git()]
}
