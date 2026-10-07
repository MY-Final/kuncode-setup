import { invoke } from "@tauri-apps/api/core";
import * as mock from "@/lib/tauri/mock";
import type {
  AgentConfig,
  AgentMeta,
  ConfigPreview,
  EnvironmentReport,
  StepResult,
  TestResult,
} from "@/lib/types";

/**
 * 所有系统级操作都必须经过 Rust。
 * 这里是对 Tauri commands 的唯一封装层，React 不直接触碰文件系统。
 *
 * 在浏览器中（pnpm dev，非 Tauri 环境）会自动降级为 mock，
 * 方便纯前端联调；打包进 Tauri 后走真实 command。
 */

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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
  if (demo || !isTauri()) return mock.mockPreviewConfig(config);
  return invoke<ConfigPreview>("preview_config", {
    agentId: config.agentId,
    config,
  });
}

export async function applyConfig(
  config: AgentConfig,
  demo = false,
): Promise<StepResult[]> {
  if (demo || !isTauri()) return mock.mockApplyConfig(config);
  return invoke<StepResult[]>("apply_config", {
    agentId: config.agentId,
    config,
  });
}

export async function testConnection(
  config: AgentConfig,
  demo = false,
): Promise<TestResult> {
  if (demo || !isTauri()) return mock.mockTestConnection();
  return invoke<TestResult>("test_connection", {
    agentId: config.agentId,
    config,
  });
}

export async function launchAgent(
  agentId: string,
  demo = false,
): Promise<string> {
  if (demo || !isTauri()) return mock.mockLaunchAgent(agentId);
  return invoke<string>("launch_agent", { agentId });
}
