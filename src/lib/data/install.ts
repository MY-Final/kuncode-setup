/** 每个 Coding 工具的本机安装方式（用于「查看安装方式」引导）。 */
export interface InstallGuide {
  /** 官方文档或安装页 */
  docs: string;
  /** 推荐命令，逐条展示 */
  commands: string[];
  note?: string;
}

export const INSTALL_GUIDES: Record<string, InstallGuide> = {
  codex: {
    docs: "https://github.com/openai/codex",
    commands: ["npm install -g @openai/codex"],
    note: "需要先安装 Node.js 18 或更高版本。",
  },
  claude: {
    docs: "https://docs.anthropic.com/en/docs/claude-code",
    commands: ["npm install -g @anthropic-ai/claude-code"],
    note: "需要先安装 Node.js 18 或更高版本。",
  },
  opencode: {
    docs: "https://opencode.ai/docs",
    commands: ["npm install -g opencode-ai"],
    note: "需要先安装 Node.js 18 或更高版本。",
  },
};

export const NODE_GUIDE: InstallGuide = {
  docs: "https://nodejs.org/zh-cn/download",
  commands: [],
  note: "从官网下载安装包，安装时保持默认选项即可。",
};

export const GIT_GUIDE: InstallGuide = {
  docs: "https://git-scm.com/download/win",
  commands: [],
  note: "从官网下载安装包，安装时保持默认选项即可。",
};

/** 工具或依赖的安装方式；未知 id 返回 null。 */
export function installGuideFor(id: string): InstallGuide | null {
  if (id === "node" || id === "npm") return NODE_GUIDE;
  if (id === "git") return GIT_GUIDE;
  return INSTALL_GUIDES[id] ?? null;
}
