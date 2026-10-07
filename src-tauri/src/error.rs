use serde::Serialize;

/// 统一的错误类型，序列化后返回给前端。
/// 注意：绝不能把 API Key / Token / 密码放进错误信息里。
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("未找到 {0}")]
    NotFound(String),

    #[error("IO 错误：{0}")]
    Io(String),

    #[error("配置文件解析失败：{0}")]
    Parse(String),

    #[error("命令执行失败：{0}")]
    Command(String),

    #[error("{0}")]
    Other(String),
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        AppError::Parse(value.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        AppError::Io(value.to_string())
    }
}

#[derive(Serialize)]
pub struct ErrorPayload {
    pub kind: String,
    pub message: String,
}

impl From<AppError> for ErrorPayload {
    fn from(value: AppError) -> Self {
        let kind = match &value {
            AppError::NotFound(_) => "not_found",
            AppError::Io(_) => "io",
            AppError::Parse(_) => "parse",
            AppError::Command(_) => "command",
            AppError::Other(_) => "error",
        };
        ErrorPayload {
            kind: kind.to_string(),
            message: value.to_string(),
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
