export type AgentId = "codex" | "claude" | "opencode" | string;

/** 与 Rust 端 ToolStatus 对应 */
export interface ToolStatus {
  id: string;
  name: string;
  installed: boolean;
  version: string | null;
  path: string | null;
}

/** 与 Rust 端 EnvironmentReport 对应 */
export interface EnvironmentReport {
  os: string;
  arch: string;
  tools: ToolStatus[];
}

/** 与 Rust 端 AgentMeta 对应 */
export interface AgentMeta {
  id: AgentId;
  name: string;
  description: string;
  installed: boolean;
  version: string | null;
  path: string | null;
}

/** 统一的 Agent 配置模型 */
export interface AgentConfig {
  agentId: AgentId;
  model: string;
  baseUrl: string;
  apiKey: string;
}

/** 与 Rust 端 ConfigPreview 对应 */
export interface ConfigPreview {
  agentId: AgentId;
  agentName: string;
  provider: string;
  baseUrl: string;
  model: string;
  maskedApiKey: string;
  configPath: string | null;
  existingConfig: boolean;
  backupPath: string | null;
  changes: string[];
}

export interface StepResult {
  step: string;
  ok: boolean;
  detail: string | null;
}

export interface TestResult {
  ok: boolean;
  latencyMs: number | null;
  message: string;
}

/** 本地登录会话（仅在内存中，MVP 不落盘明文） */
export interface Session {
  account: string;
  balance: string;
}
