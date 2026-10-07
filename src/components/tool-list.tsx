import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { AgentIcon } from "@/components/agent-icon";
import { Button } from "@/components/ui/button";
import { OperationDialog } from "@/components/operation-dialog";
import { useApp } from "@/lib/store";
import { useAgentLaunch } from "@/lib/use-agent-launch";
import { DEMO_MODELS } from "@/lib/data/models";
import { AGENT_PRESENTATION } from "@/lib/data/agents";

export function ToolList({ management = false }: { management?: boolean }) {
  const { agents, configurations, loading, error, refresh } = useApp();
  const navigate = useNavigate();
  const { operation, launch, close } = useAgentLaunch();
  return (
    <>
      {error && (
        <p className="inline-error" role="alert">
          暂时无法读取工具状态。
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            重试
          </Button>
        </p>
      )}
      <section
        className="coding-tools"
        aria-label="Coding Tools"
        aria-busy={loading}
      >
        {agents.map((agent) => {
          const config = configurations[agent.id];
          const ready = config?.status === "ready";
          const failed = config?.status === "error";
          const model =
            DEMO_MODELS.find((item) => item.id === config?.model)?.name ??
            config?.model;
          return (
            <article className="coding-tool" key={agent.id}>
              <AgentIcon id={agent.id} />
              <div className="coding-tool-copy">
                <h3>{agent.name}</h3>
                <p>
                  {AGENT_PRESENTATION[agent.id]?.vendor ?? agent.description}
                </p>
                <span
                  className={`tool-state ${failed ? "error" : ready ? "ready" : ""}`}
                >
                  {model && (
                    <>
                      {model}
                      <span className="state-separator">·</span>
                    </>
                  )}
                  {failed
                    ? "配置异常"
                    : ready
                      ? config.demo
                        ? "演示已配置"
                        : "已配置"
                      : "尚未配置"}
                </span>
              </div>
              <div className="tool-actions">
                {management && ready && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/setup/${agent.id}`)}
                  >
                    重新配置
                  </Button>
                )}
                <Button
                  className="tool-primary"
                  onClick={() =>
                    ready ? void launch(agent) : navigate(`/setup/${agent.id}`)
                  }
                  disabled={operation?.phase === "running" || loading}
                >
                  {ready
                    ? `启动 ${agent.name}`
                    : failed
                      ? "修复配置"
                      : "开始配置"}
                  <ArrowRight />
                </Button>
              </div>
            </article>
          );
        })}
        {loading && !agents.length && (
          <div className="empty-state" role="status">
            <Loader2 className="animate-spin" />
            正在准备工具…
          </div>
        )}
      </section>
      <OperationDialog
        operation={operation}
        onClose={close}
        action={
          operation?.phase === "error"
            ? {
                label: "修复配置",
                onClick: () => {
                  const id = operation.agentId;
                  close();
                  if (id) navigate(`/setup/${id}`);
                },
              }
            : undefined
        }
      />
    </>
  );
}
