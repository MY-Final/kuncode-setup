import { useRef, useState } from "react";
import { useApp } from "@/lib/store";
import * as api from "@/lib/tauri/api";
import { errorMessage } from "@/lib/utils";
import type { AgentMeta } from "@/lib/types";
import type {
  OperationState,
  OperationStep,
} from "@/components/operation-dialog";

export function useAgentLaunch() {
  const { configurations, environment, refreshConnections } = useApp();
  const [operation, setOperation] = useState<OperationState | null>(null);
  const locked = useRef(false);
  async function launch(agent: AgentMeta) {
    const configured = configurations[agent.id];
    if (locked.current || configured?.status !== "ready") return;
    locked.current = true;
    const steps: OperationStep[] = [
      ...["node", "git"].map((id): OperationStep => ({
        label: id === "node" ? "Node.js" : "Git",
        status: environment?.tools.find((tool) => tool.id === id)?.installed
          ? "complete"
          : "warning",
      })),
      {
        label: agent.name,
        status: agent.installed || configured.demo ? "complete" : "error",
      },
      { label: "检查服务连接", status: "running" },
      { label: `启动 ${agent.name}`, status: "waiting" },
    ];
    const state: OperationState = {
      agentId: agent.id,
      title: `正在启动 ${agent.name}`,
      description: configured.demo
        ? "演示启动，不会打开本机工具。"
        : "检查已配置的工具连接，然后打开工具。",
      phase: "running",
      steps,
      progress: 50,
    };
    const show = (changes: Partial<OperationState>) =>
      setOperation({
        ...state,
        steps: steps.map((step) => ({ ...step })),
        ...changes,
      });
    show({});
    let warning: string | undefined;
    try {
      if (!agent.installed && !configured.demo)
        throw new Error(`未检测到 ${agent.name}，请到系统诊断检查安装状态。`);
      if (configured.demo)
        await api.testConnection(
          {
            agentId: agent.id,
            model: configured.model,
            baseUrl: "",
            apiKey: "",
          },
          true,
        );
      else {
        try {
          const result = await api.probeToolConnection(agent.id);
          if (!result.ok) throw new Error(result.message);
        } catch (value) {
          const kind =
            typeof value === "object" && value !== null && "kind" in value
              ? value.kind
              : "error";
          if (kind === "auth" || kind === "parse") {
            await refreshConnections();
            throw value;
          }
          warning = `${errorMessage(value)}。继续打开已配置的工具。`;
        }
      }
      steps[3].status = warning ? "warning" : "complete";
      steps[4].status = "running";
      show({ progress: 80 });
      await api.launchAgent(agent.id, configured.demo);
      steps[4].status = "complete";
      show({
        title: configured.demo
          ? `${agent.name} 演示启动完成`
          : `${agent.name} 已启动`,
        description:
          warning ??
          (configured.demo
            ? "未启动本机工具，也未连接真实站点。"
            : "工具已打开，可以开始使用。"),
        phase: "success",
        progress: 100,
      });
    } catch (value) {
      const kind =
        typeof value === "object" && value !== null && "kind" in value
          ? value.kind
          : "error";
      steps
        .filter((step) => step.status === "running")
        .forEach((step) => {
          step.status = "error";
        });
      show({
        title: `${agent.name} 启动未完成`,
        description: "请根据提示检查工具或连接。",
        phase: "error",
        error: errorMessage(value),
        needsRepair: kind === "auth" || kind === "parse",
      });
    } finally {
      locked.current = false;
    }
  }
  return { operation, launch, close: () => setOperation(null) };
}
