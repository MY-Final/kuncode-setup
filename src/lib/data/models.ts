/** 首版演示目录，不代表服务端可用模型或真实价格。替换此数据层即可接入 Setup API。 */
export interface ModelItem {
  id: string;
  name: string;
  provider: string;
  description: string;
  tag: string;
}
export const DEMO_MODELS: ModelItem[] = [
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    provider: "OpenAI",
    description: "适合日常编码、快速迭代与轻量任务",
    tag: "日常开发",
  },
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    provider: "OpenAI",
    description: "适合复杂推理、架构分析与深入调试",
    tag: "复杂任务",
  },
  {
    id: "claude-sonnet",
    name: "Claude Sonnet",
    provider: "Anthropic",
    description: "适合代码理解、文档整理与长上下文任务",
    tag: "代码理解",
  },
];
export const DEFAULT_MODEL = DEMO_MODELS[0].id;
export const DEFAULT_BASE_URL = "https://api.kuncode.ai/v1";
