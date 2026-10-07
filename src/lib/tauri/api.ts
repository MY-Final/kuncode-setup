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
  AccountProfile,
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
export async function previewConnection(
  connectionId: string,
  agentId: string,
  model: string,
): Promise<ConfigPreview> {
  requireDesktop();
  return invoke("preview_connection_config", { connectionId, agentId, model });
}
export async function applyConnection(
  connectionId: string,
  agentId: string,
  model: string,
  onStep: (step: ConnectionStep) => void,
): Promise<ConfigurationOutcome> {
  requireDesktop();
  const progress = new Channel<ConnectionStep>();
  progress.onmessage = onStep;
  return invoke("apply_connection_config", {
    connectionId,
    agentId,
    model,
    progress,
  });
}
export async function probeToolConnection(
  agentId: string,
): Promise<TestResult> {
  requireDesktop();
  return invoke("probe_tool_connection", { agentId });
}
