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
  advanced?: AdvancedConfig;
}

export interface ModelSettings {
  name?: string | null;
  imageInput?: boolean | null;
  reasoning?: boolean | null;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  reasoningEffort?: string | null;
  reasoningEfforts?: string[];
  thinkingBudget?: number | null;
  options?: Record<string, unknown> | null;
  variants?: Record<string, Record<string, unknown>> | null;
}
export interface AdvancedConfig {
  models: Record<string, ModelSettings>;
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
  /** 用户自定义别名，优先展示。 */
  alias?: string | null;
  /** 用户自定义备注。 */
  note?: string | null;
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
  advanced?: AdvancedConfig;
  models?: string[];
  group?: string | null;
  tokenId: number | null;
  status: "ready" | "error";
  verified: boolean;
  inferenceVerified?: boolean;
}

/** 站点密钥（token），与 Rust 端 http::SiteToken 对应。列表永远只返回掩码。 */
export interface SiteToken {
  id: number;
  name: string;
  maskedKey: string;
  group: string;
  status: number;
  unlimitedQuota: boolean;
  remainQuota: number;
  usedQuota: number;
  expiredTime: number;
  accessedTime: number;
  modelLimitsEnabled: boolean;
  modelLimits: string[];
  boundAgents: string[];
}

/** 站点分组，与 Rust 端 http::SiteGroup 对应。 */
export interface SiteGroup {
  name: string;
  description: string | null;
  ratio: string | number | null;
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
/** 与 Rust 端 BindingCheck 对应：启动前一致性校验结果 */
export interface BindingCheck {
  agentId: string;
  ok: boolean;
  reason: "ok" | "config" | "key" | "model" | "network" | "unverified";
  needsRebind: boolean;
  message: string;
}
/** 与 Rust 端 RestoreOutcome 对应：从备份恢复配置的结果 */
export interface RestoreOutcome {
  agentId: string;
  restored: string[];
  missing: string[];
  removed: string[];
}
/** 与 Rust 端 ConfigFileView 对应：脱敏后的配置文件视图 */
export interface ConfigFileView {
  path: string;
  exists: boolean;
  content: string | null;
}
/** 与 Rust 端 ToolDetail 对应：已配置工具的详情 */
export interface ToolDetail {
  agentId: string;
  agentName: string;
  connectionId: string;
  connectionLabel: string | null;
  siteUrl: string;
  baseUrl: string;
  model: string;
  advanced?: AdvancedConfig;
  models: string[];
  group: string | null;
  tokenId: number | null;
  status: string;
  verified: boolean;
  inferenceVerified?: boolean;
  configPaths: string[];
  configFiles: ConfigFileView[];
}
export interface AccountProfile {
  connectionId: string;
  /** 站点类型；newapi 为当前实现，sub2api 等可复用同一契约 */
  provider: string;
  kind: ConnectionKind;
  siteUrl: string;
  authenticated: boolean;
  account: string | null;
  username: string | null;
  displayName: string | null;
  userId: number | null;
  email: string | null;
  role: string | null;
  group: string | null;
  status: string | null;
  balance: number | null;
  usedQuota: number | null;
  requestCount: number | null;
  quotaDisplayType: string | null;
  currencySymbol: string | null;
  quotaPerUnit: number | null;
  memberSince: number | null;
  expiresAt: number | null;
  connected: boolean;
}
