import type {
  AgentConfig,
  AgentMeta,
  ConfigPreview,
  EnvironmentReport,
  StepResult,
  TestResult,
} from "@/lib/types";

/**
 * 浏览器开发（pnpm dev）时使用的假数据。
 * 打包进 Tauri 后这些分支不会被触发。
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockDetectEnvironment(): Promise<EnvironmentReport> {
  await delay(400);
  return {
    os: "Windows 11",
    arch: "x86_64",
    tools: [
      {
        id: "node",
        name: "Node.js",
        installed: true,
        version: "v22.19.0",
        path: "C:\\Program Files\\nodejs\\node.exe",
      },
      {
        id: "npm",
        name: "npm",
        installed: true,
        version: "10.9.3",
        path: "C:\\Program Files\\nodejs\\npm.cmd",
      },
      {
        id: "git",
        name: "Git",
        installed: true,
        version: "git version 2.54.0",
        path: "C:\\Program Files\\Git\\cmd\\git.exe",
      },
    ],
  };
}

export async function mockListAgents(): Promise<AgentMeta[]> {
  await delay(300);
  return [
    {
      id: "codex",
      name: "Codex",
      description: "OpenAI 官方 AI 编程助手",
      installed: true,
      version: "codex 0.58.0",
      path: "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd",
    },
    {
      id: "claude",
      name: "Claude Code",
      description: "Anthropic 官方 AI 编程工具",
      installed: false,
      version: null,
      path: null,
    },
    {
      id: "opencode",
      name: "OpenCode",
      description: "开源 AI Coding Agent",
      installed: true,
      version: "0.6.5",
      path: "C:\\Users\\me\\AppData\\Roaming\\npm\\opencode.cmd",
    },
  ];
}

export async function mockPreviewConfig(
  config: AgentConfig,
): Promise<ConfigPreview> {
  await delay(300);
  return {
    agentId: config.agentId,
    agentName: config.agentId,
    provider: "KunCode",
    baseUrl: config.baseUrl,
    model: config.model,
    maskedApiKey: "sk-••••••••1234",
    configPath: "C:\\Users\\me\\.codex\\config.toml",
    existingConfig: true,
    backupPath: "C:\\Users\\me\\.codex\\config.toml.kuncode.bak",
    changes: [
      "写入 KunCode Provider 配置",
      `设置默认模型为 ${config.model}`,
      "保存 API Key",
    ],
  };
}

export async function mockApplyConfig(): Promise<StepResult[]> {
  await delay(1200);
  return [
    { step: "检查 Codex", ok: true, detail: "codex 0.58.0" },
    { step: "备份原配置", ok: true, detail: "config.toml.kuncode.bak" },
    { step: "写入配置", ok: true, detail: null },
    { step: "测试连接", ok: true, detail: "KunCode API 正常" },
  ];
}

export async function mockTestConnection(): Promise<TestResult> {
  await delay(1000);
  return { ok: true, latencyMs: 1420, message: "KunCode API 正常" };
}

export async function mockLaunchAgent(agentId: string): Promise<string> {
  await delay(300);
  return `已启动 ${agentId}（模拟）`;
}
