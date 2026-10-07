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
  connectionId: string;
}

export type ConnectionKind = "kuncode_authorized" | "newapi_pat" | "api_key";
export interface ConnectionSummary {
  id: string;
  kind: ConnectionKind;
  siteUrl: string;
  apiBaseUrl: string;
  account: string | null;
  userId: number | null;
  legacyUserId: number | null;
  expiresAt: number | null;
  connected: boolean;
  verified: boolean;
}
export interface ToolBinding {
  agentId: string;
  connectionId: string;
  model: string;
  tokenId: number | null;
  status: "ready" | "error";
  verified: boolean;
}
export interface ConnectionSnapshot {
  authorizationSite: string;
  currentOfficial: string | null;
  connections: ConnectionSummary[];
  bindings: Record<string, ToolBinding>;
}
export interface ImportConnection {
  kind: "newapi_pat" | "api_key";
  siteUrl: string;
  apiBaseUrl?: string;
  credential: string;
  userId?: number;
}
export interface ConnectionDraft {
  agentId: string;
  connectionId: string;
  model: string;
  demo: boolean;
}
export interface ConnectionStep {
  step: string;
  status: "waiting" | "running" | "complete" | "warning" | "error";
  detail: string | null;
}
export interface ConfigurationOutcome {
  binding: ToolBinding;
  steps: ConnectionStep[];
}
