import { Channel, invoke } from "@tauri-apps/api/core";
import * as mock from "@/lib/tauri/mock";
import type {
  AgentConfig,
  AgentMeta,
  ConfigPreview,
  EnvironmentReport,
  StepResult,
  TestResult,
  ConnectionSnapshot,
  ConnectionSummary,
  ConnectionStep,
  ImportConnection,
  ConfigurationOutcome,
  BindingCheck,
  RestoreOutcome,
  AccountProfile,
  SiteToken,
  SiteGroup,
  ToolDetail,
} from "@/lib/types";

/**
 * 所有系统级操作都必须经过 Rust。
 * 这里是对 Tauri commands 的唯一封装层，React 不直接触碰文件系统。
 *
 * 浏览器仅提供环境展示和显式演示。真实登录和配置必须由原生命令执行。
 */

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const DEFAULT_AUTHORIZATION_SITE = "https://kuncode.120403.xyz";

export async function detectEnvironment(): Promise<EnvironmentReport> {
  if (!isTauri()) return mock.mockDetectEnvironment();
  return invoke<EnvironmentReport>("detect_environment");
}

export async function listAgents(): Promise<AgentMeta[]> {
  if (!isTauri()) return mock.mockListAgents();
  return invoke<AgentMeta[]>("list_agents");
}

export async function previewConfig(
  config: AgentConfig,
  demo = false,
): Promise<ConfigPreview> {
  if (demo) return mock.mockPreviewConfig(config);
  throw new Error("请通过站点连接配置工具");
}

export async function applyConfig(
  config: AgentConfig,
  demo = false,
  onStep?: (step: StepResult) => void,
): Promise<StepResult[]> {
  if (demo) return mock.mockApplyConfig(config, onStep);
  throw new Error("请通过站点连接配置工具");
}

export async function testConnection(
  config: AgentConfig,
  demo = false,
): Promise<TestResult> {
  if (demo) return mock.mockTestConnection();
  return probeToolConnection(config.agentId);
}

export async function launchAgent(
  agentId: string,
  demo = false,
): Promise<string> {
  if (demo) return mock.mockLaunchAgent(agentId);
  requireDesktop();
  return invoke<string>("launch_agent", { agentId });
}

function requireDesktop() {
  if (!isTauri())
    throw new Error(
      "真实登录和配置请在 Windows 桌面应用中完成；浏览器仅提供演示",
    );
}
export async function listConnections(): Promise<ConnectionSnapshot> {
  if (!isTauri())
    return {
      authorizationSite: DEFAULT_AUTHORIZATION_SITE,
      currentOfficial: null,
      connections: [],
      bindings: {},
    };
  return invoke("list_connections");
}
export async function setAuthorizationSite(
  site: string,
): Promise<ConnectionSnapshot> {
  requireDesktop();
  return invoke("set_authorization_site", { site });
}
export async function startLogin(
  attemptId: string,
  onStep: (step: ConnectionStep) => void,
): Promise<ConnectionSummary> {
  requireDesktop();
  const progress = new Channel<ConnectionStep>();
  progress.onmessage = onStep;
  return invoke("start_login", { attemptId, progress });
}
export async function cancelLogin(attemptId: string): Promise<void> {
  requireDesktop();
  return invoke("cancel_login", { attemptId });
}
export async function importConnection(
  input: ImportConnection,
): Promise<ConnectionSummary> {
  requireDesktop();
  return invoke("import_connection", { input });
}
export async function connectionModels(
  connectionId: string,
): Promise<string[]> {
  requireDesktop();
  return invoke("connection_models", { connectionId });
}
export async function connectionProfile(
  connectionId: string,
): Promise<AccountProfile> {
  requireDesktop();
  return invoke("connection_profile", { connectionId });
}
export async function logoutConnection(
  connectionId: string,
): Promise<string | null> {
  requireDesktop();
  return invoke("logout_connection", { connectionId });
}
export async function listSiteTokens(
  connectionId: string,
): Promise<SiteToken[]> {
  if (!isTauri()) return mock.mockListSiteTokens();
  return invoke("list_site_tokens", { connectionId });
}
export async function siteGroups(connectionId: string): Promise<SiteGroup[]> {
  if (!isTauri()) return mock.mockSiteGroups();
  return invoke("site_groups", { connectionId });
}
export async function groupModels(
  connectionId: string,
  group: string,
): Promise<string[]> {
  if (!isTauri()) return mock.mockGroupModels();
  return invoke("group_models", { connectionId, group });
}
export async function createSiteToken(
  connectionId: string,
  name: string,
  group: string,
  modelLimits: string[],
): Promise<number> {
  requireDesktop();
  return invoke("create_site_token", {
    connectionId,
    name,
    group,
    modelLimits,
  });
}
export async function updateSiteToken(
  connectionId: string,
  tokenId: number,
  name: string,
  group: string,
  modelLimits: string[],
): Promise<void> {
  requireDesktop();
  return invoke("update_site_token", {
    connectionId,
    tokenId,
    name,
    group,
    modelLimits,
  });
}
export async function deleteSiteToken(
  connectionId: string,
  tokenId: number,
): Promise<void> {
  requireDesktop();
  return invoke("delete_site_token", { connectionId, tokenId });
}
export async function previewConnection(
  connectionId: string,
  agentId: string,
  model: string,
  models: string[] = [],
): Promise<ConfigPreview> {
  requireDesktop();
  return invoke("preview_connection_config", {
    connectionId,
    agentId,
    model,
    models,
  });
}
export async function applyConnection(
  connectionId: string,
  agentId: string,
  model: string,
  onStep: (step: ConnectionStep) => void,
  tokenId?: number,
  group?: string,
  models: string[] = [],
  rebuild = false,
): Promise<ConfigurationOutcome> {
  requireDesktop();
  const progress = new Channel<ConnectionStep>();
  progress.onmessage = onStep;
  return invoke("apply_connection_config", {
    connectionId,
    agentId,
    selection: {
      model,
      models,
      tokenId: tokenId ?? null,
      group: group ?? null,
      rebuild,
    },
    progress,
  });
}
export async function checkToolConnection(
  agentId: string,
): Promise<BindingCheck> {
  if (!isTauri())
    return {
      agentId,
      ok: true,
      reason: "ok",
      needsRebind: false,
      message: "演示环境，未做真实校验",
    };
  return invoke("check_tool_connection", { agentId });
}
export async function restoreToolConfig(
  agentId: string,
): Promise<RestoreOutcome> {
  requireDesktop();
  return invoke("restore_tool_config", { agentId });
}
export async function renameConnection(
  connectionId: string,
  alias: string | null,
  note: string | null,
): Promise<ConnectionSummary> {
  requireDesktop();
  return invoke("rename_connection", { connectionId, alias, note });
}
export async function toolDetail(agentId: string): Promise<ToolDetail> {
  requireDesktop();
  return invoke("tool_detail", { agentId });
}
export async function revealSiteTokenKey(
  connectionId: string,
  tokenId: number,
): Promise<string> {
  requireDesktop();
  return invoke("reveal_site_token_key", { connectionId, tokenId });
}
export async function pingConnection(
  connectionId: string,
): Promise<number | null> {
  requireDesktop();
  return invoke("ping_connection", { connectionId });
}
export async function probeToolConnection(
  agentId: string,
): Promise<TestResult> {
  requireDesktop();
  return invoke("probe_tool_connection", { agentId });
}

export async function testToolInference(agentId: string): Promise<TestResult> {
  requireDesktop();
  return invoke("test_tool_inference", { agentId });
}
