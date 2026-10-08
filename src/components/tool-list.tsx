import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AgentIcon } from "@/components/agent-icon";
import { Button } from "@/components/ui/button";
import { OperationDialog } from "@/components/operation-dialog";
import { RebindDialog } from "@/components/rebind-dialog";
import { useApp } from "@/lib/store";
import { useAgentLaunch } from "@/lib/use-agent-launch";
import * as api from "@/lib/tauri/api";
import { DEMO_MODELS } from "@/lib/data/models";
import { AGENT_PRESENTATION } from "@/lib/data/agents";
import { errorMessage } from "@/lib/utils";
import type { AgentMeta } from "@/lib/types";

export function ToolList({ management = false }: { management?: boolean }) {
  const {
    agents,
    configurations,
    loading,
    error,
    refresh,
    refreshConnections,
  } = useApp();
  const navigate = useNavigate();
  const { operation, launch, close } = useAgentLaunch();
  const [rebind, setRebind] = useState<AgentMeta | null>(null);

  async function restore(agentId: string) {
    close();
    try {
      const outcome = await api.restoreToolConfig(agentId);
      await refreshConnections();
      await refresh();
      toast.success(`已从备份恢复 ${outcome.restored.length} 个配置文件`);
    } catch (value) {
      toast.error(errorMessage(value));
    }
  }

  const errorActions = (() => {
    if (operation?.phase !== "error") return undefined;
    const id = operation.agentId;
    if (!id) return undefined;
    const actions = [] as { label: string; onClick: () => void }[];
    if (operation.needsRebind) {
      const agent = agents.find((item) => item.id === id);
      actions.push({
        label: "换绑密钥",
        onClick: () => {
          close();
          if (agent) setRebind(agent);
        },
      });
    } else if (operation.canRestore) {
      actions.push({
        label: "恢复备份",
        onClick: () => void restore(id),
      });
    }
    actions.push({
      label: operation.needsRebind ? "重新配置" : "修复配置",
      onClick: () => {
        close();
        navigate(`/setup/${id}`);
      },
    });
    return actions;
  })();

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
            (config?.demo
              ? DEMO_MODELS.find((item) => item.id === config?.model)?.name
              : undefined) ?? config?.model;
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
                {ready && !config.demo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/tools/${agent.id}`)}
                  >
                    配置详情
                  </Button>
                )}
                {management && ready && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/setup/${agent.id}`)}
                  >
                    重新配置
                  </Button>
                )}
                {ready && !config.demo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRebind(agent)}
                  >
                    换绑密钥
                  </Button>
                )}
                {management && ready && !config.demo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void restore(agent.id)}
                  >
                    恢复备份
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
        actions={errorActions}
      />
      <RebindDialog
        agent={rebind}
        onOpenChange={(open) => {
          if (!open) setRebind(null);
        }}
        onDone={() => toast.success("密钥已换绑，配置已更新")}
      />
    </>
  );
}
