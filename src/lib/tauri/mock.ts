import type {
  AgentConfig,
  AgentMeta,
  ConfigPreview,
  EnvironmentReport,
  SiteGroup,
  SiteToken,
  StepResult,
  TestResult,
} from "@/lib/types";

/**
 * 浏览器开发（pnpm dev）时使用的假数据。
 * 打包进 Tauri 后这些分支不会被触发。
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const agentNames: Record<string, string> = {
  codex: "Codex",
  claude: "Claude Code",
  opencode: "OpenCode",
};
const configFiles: Record<string, string> = {
  codex: ".codex\\config.toml",
  claude: ".claude\\settings.json",
  opencode: ".config\\opencode\\opencode.json",
};

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
    agentName: agentNames[config.agentId] ?? config.agentId,
    provider: "KunCode",
    baseUrl: config.baseUrl,
    model: config.model,
    maskedApiKey: "演示凭据 · 不会写入",
    configPath: `C:\\Users\\demo\\${configFiles[config.agentId] ?? "config.json"}`,
    existingConfig: true,
    backupPath: `C:\\Users\\demo\\${configFiles[config.agentId] ?? "config.json"}.kuncode.bak`,
    changes: [
      "模拟写入 KunCode Provider 配置",
      `模拟设置默认模型为 ${config.model}`,
      "模拟保存凭据（不写入文件）",
    ],
  };
}

export async function mockApplyConfig(
  config: AgentConfig,
  onStep?: (step: StepResult) => void,
): Promise<StepResult[]> {
  const results: StepResult[] = [
    {
      step: `检查 ${agentNames[config.agentId] ?? config.agentId}`,
      ok: true,
      detail: "演示结果",
    },
    { step: "备份原配置", ok: true, detail: "模拟备份 · 未修改文件" },
    { step: "写入配置", ok: true, detail: `模拟设置模型 ${config.model}` },
    { step: "测试连接", ok: true, detail: "演示成功 · 未发送网络请求" },
  ];
  for (const result of results) {
    await delay(500);
    onStep?.(result);
  }
  return results;
}

export async function mockTestConnection(): Promise<TestResult> {
  await delay(1000);
  return {
    ok: true,
    latencyMs: null,
    message: "演示测试成功（未发送实际请求）",
  };
}

export async function mockLaunchAgent(agentId: string): Promise<string> {
  await delay(300);
  return `已启动 ${agentId}（模拟）`;
}

export async function mockListSiteTokens(): Promise<SiteToken[]> {
  await delay(300);
  return [
    {
      id: 1,
      name: "日常开发",
      maskedKey: "sk-abcd********9f2c",
      group: "default",
      status: 1,
      unlimitedQuota: true,
      remainQuota: 0,
      usedQuota: 0,
      expiredTime: -1,
      accessedTime: 0,
      modelLimitsEnabled: false,
      modelLimits: [],
      boundAgents: ["codex"],
    },
    {
      id: 2,
      name: "省钱专用",
      maskedKey: "sk-77aa********10d8",
      group: "vip",
      status: 1,
      unlimitedQuota: false,
      remainQuota: 5,
      usedQuota: 12,
      expiredTime: -1,
      accessedTime: 0,
      modelLimitsEnabled: false,
      modelLimits: [],
      boundAgents: [],
    },
  ];
}

export async function mockSiteGroups(): Promise<SiteGroup[]> {
  await delay(150);
  return [
    { name: "default", description: "默认费率", ratio: 1 },
    { name: "vip", description: "低倍率", ratio: 0.8 },
  ];
}

export async function mockGroupModels(): Promise<string[]> {
  await delay(200);
  return ["gpt-5.1", "claude-sonnet-4.5", "deepseek-v3.2"];
}
