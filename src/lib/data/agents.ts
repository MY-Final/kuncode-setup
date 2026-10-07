export const AGENT_PRESENTATION: Record<
  string,
  { vendor: string; description: string }
> = {
  codex: {
    vendor: "OpenAI 官方 AI Coding Agent",
    description: "强大的智能编码助手，擅长代码生成、调试和任务执行。",
  },
  claude: {
    vendor: "Anthropic 官方 AI Coding Agent",
    description: "擅长复杂任务处理和长上下文理解，适合深度开发场景。",
  },
  opencode: {
    vendor: "开源 AI Coding Agent",
    description: "轻量、灵活、开源，支持多种模型和自定义配置。",
  },
};
