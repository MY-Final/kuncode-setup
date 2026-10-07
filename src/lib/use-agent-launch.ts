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
  const { configurations, environment, draft, recordConfiguration } = useApp();
  const [operation, setOperation] = useState<OperationState | null>(null);
  const locked = useRef(false);
  async function launch(agent: AgentMeta) {
    if (locked.current) return;
    const configured = configurations[agent.id];
    if (!configured || configured.status !== "ready") return;
    locked.current = true;
    const connection = draft?.agentId === agent.id ? draft : null;
    const test = configured.demo || !!connection?.apiKey;
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
      ...(test
        ? [{ label: "测试 KunCode 连接", status: "running" as const }]
        : []),
      { label: `启动 ${agent.name}`, status: test ? "waiting" : "running" },
    ];
    const state: OperationState = {
      agentId: agent.id,
      title: `正在启动 ${agent.name}`,
      description: configured.demo
        ? "演示启动，不会打开本机工具。"
        : "检查连接后打开工具。",
      phase: "running",
      steps,
      progress: test ? 50 : 75,
    };
    setOperation({ ...state, steps: steps.map((step) => ({ ...step })) });
    try {
      if (!agent.installed && !configured.demo)
        throw new Error(`未检测到 ${agent.name}，请到系统诊断检查安装状态。`);
      if (test) {
        const result = await api.testConnection(
          connection ?? {
            agentId: agent.id,
            model: configured.model,
            baseUrl: "",
            apiKey: "",
          },
          configured.demo,
        );
        steps[3].status = result.ok ? "complete" : "error";
        if (!result.ok)
          throw new Error("KunCode 连接未通过，请重新配置或前往系统诊断。");
        steps[4].status = "running";
        setOperation({
          ...state,
          steps: steps.map((step) => ({ ...step })),
          progress: 80,
        });
      }
      await api.launchAgent(agent.id, configured.demo);
      steps[steps.length - 1].status = "complete";
      setOperation({
        ...state,
        title: configured.demo
          ? `${agent.name} 演示启动完成`
          : `${agent.name} 已启动`,
        description: configured.demo
          ? "演示流程已完成，本机工具未被打开。"
          : "工具已打开，可以开始使用。",
        steps: steps.map((step) => ({ ...step })),
        phase: "success",
        progress: 100,
      });
    } catch (error) {
      steps
        .filter((step) => step.status === "running")
        .forEach((step) => {
          step.status = "error";
        });
      const message = errorMessage(error);
      recordConfiguration(agent.id, configured.model, configured.demo, "error");
      setOperation({
        ...state,
        title: `${agent.name} 启动未完成`,
        phase: "error",
        description: "请检查连接或修复配置后重试。",
        steps: steps.map((step) => ({ ...step })),
        progress: 100,
        error: connection?.apiKey
          ? message.split(connection.apiKey).join("[凭据已隐藏]")
          : message,
      });
    } finally {
      locked.current = false;
    }
  }
  return { operation, launch, close: () => setOperation(null) };
}
