use std::io::Read;
use std::time::Instant;

use serde_json::json;

use super::model::TestResult;

/// 通过一次最小的 chat/completions 请求验证：
/// Base URL 可访问、Key 有效、模型存在。
///
/// 说明：这里用 macOS/Linux 上也存在的 `curl` 作为传输层，
/// 避免为了 MVP 引入完整的异步 HTTP 客户端与 TLS 依赖。
/// 失败信息经过脱敏，绝不回显 Key。
pub fn probe(base_url: &str, api_key: &str, model: &str) -> TestResult {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let body = json!({
        "model": model,
        "messages": [{ "role": "user", "content": "ping" }],
        "max_tokens": 1,
        "stream": false,
    })
    .to_string();

    let started = Instant::now();

    let mut cmd = std::process::Command::new("curl");
    cmd.args([
        "-sS",
        "-m",
        "20",
        "-o",
        "-",
        "-w",
        "\n%{http_code}",
        "-X",
        "POST",
        &url,
        "-H",
        "Content-Type: application/json",
        "-H",
        &format!("Authorization: Bearer {api_key}"),
        "-d",
        &body,
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = match cmd.output() {
        Ok(o) => o,
        Err(e) => {
            return TestResult {
                ok: false,
                latency_ms: None,
                message: format!("无法发起测试请求：{e}"),
            }
        }
    };

    let latency = started.elapsed().as_millis() as u64;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    // 最后一行是 http_code。
    let (resp_body, code_str) = match stdout.rsplit_once('\n') {
        Some((body, code)) => (body.to_string(), code.trim().to_string()),
        None => (String::new(), stdout.trim().to_string()),
    };
    let code: u16 = code_str.parse().unwrap_or(0);

    if code == 200 {
        return TestResult {
            ok: true,
            latency_ms: Some(latency),
            message: "KunCode API 正常".to_string(),
        };
    }

    // 从响应体里提取人类可读的错误，但只保留 message 字段，避免泄露。
    let detail = extract_error_message(&resp_body);
    let message = match code {
        401 | 403 => "API Key 无效或已失效".to_string(),
        404 => "模型或接口不存在".to_string(),
        0 => format!("请求失败：{}", truncate(&resp_body, 120)),
        _ => format!("HTTP {code}：{detail}"),
    };

    TestResult {
        ok: false,
        latency_ms: Some(latency),
        message,
    }
}

fn extract_error_message(body: &str) -> String {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(msg) = v
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
        {
            return truncate(msg, 160);
        }
        if let Some(msg) = v.get("message").and_then(|m| m.as_str()) {
            return truncate(msg, 160);
        }
    }
    truncate(body, 160)
}

fn truncate(s: &str, max: usize) -> String {
    let mut out: String = s.chars().take(max).collect();
    if s.chars().count() > max {
        out.push('…');
    }
    out
}

/// 保留以满足某些平台的链接需求（未使用，占位避免 dead_code 警告）。
#[allow(dead_code)]
fn _read_all(mut r: impl Read) -> std::io::Result<Vec<u8>> {
    let mut buf = Vec::new();
    r.read_to_end(&mut buf)?;
    Ok(buf)
}
