import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { AgentIcon } from "@/components/agent-icon";
import { Button } from "@/components/ui/button";
import { RebindDialog } from "@/components/rebind-dialog";
import { useApp } from "@/lib/store";
import * as api from "@/lib/tauri/api";
import { errorMessage } from "@/lib/utils";
import type { AgentMeta, ToolDetail } from "@/lib/types";

export default function ToolDetailPage() {
  const { agent: agentId = "codex" } = useParams();
  const navigate = useNavigate();
  const { agents, refreshConnections, refresh } = useApp();
  const agent = agents.find((item) => item.id === agentId);
  const [detail, setDetail] = useState<ToolDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rebind, setRebind] = useState<AgentMeta | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setDetail(await api.toolDetail(agentId));
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  async function restore() {
    if (restoring) return;
    setRestoring(true);
    try {
      const outcome = await api.restoreToolConfig(agentId);
      await refreshConnections();
      await refresh();
      toast.success(`已从备份恢复 ${outcome.restored.length} 个配置文件`);
      navigate("/models");
    } catch (value) {
      toast.error(errorMessage(value));
    } finally {
      setRestoring(false);
    }
  }

  if (!agent) {
    return <PageHeader title="未找到这个工具" />;
  }

  return (
    <div className="tools-page">
      <PageHeader
        title={`${agent.name} 配置详情`}
        description="查看当前使用的密钥、模型，以及程序写入的配置文件。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} />
            刷新
          </Button>
        }
      />
      <button
        type="button"
        className="flow-back"
        onClick={() => navigate("/models")}
      >
        <ArrowLeft />
        返回工具列表
      </button>
      {loading && !detail && (
        <p role="status">
          <Loader2 className="animate-spin inline" />
          正在读取工具配置…
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {detail && (
        <>
          <section className="tool-detail-card">
            <div className="tool-detail-head">
              <AgentIcon id={detail.agentId} />
              <div>
                <h2>{detail.agentName}</h2>
                <p>{detail.connectionLabel ?? detail.siteUrl}</p>
              </div>
              <span
                className={`tool-state ${detail.status === "error" ? "error" : "ready"}`}
              >
                {detail.status === "error"
                  ? "配置异常"
                  : detail.verified
                    ? "已验证"
                    : "已配置"}
              </span>
            </div>
            <dl className="detail-list">
              <div>
                <dt>站点连接</dt>
                <dd>{detail.connectionLabel ?? detail.siteUrl}</dd>
              </div>
              <div>
                <dt>服务地址</dt>
                <dd className="mono">{detail.baseUrl}</dd>
              </div>
              <div>
                <dt>默认模型</dt>
                <dd>{detail.model}</dd>
              </div>
              <div>
                <dt>可用模型</dt>
                <dd>{detail.models.join("、")}</dd>
              </div>
              {detail.group && (
                <div>
                  <dt>分组</dt>
                  <dd>{detail.group}</dd>
                </div>
              )}
              {detail.tokenId != null && (
                <div>
                  <dt>密钥 ID</dt>
                  <dd className="mono">{detail.tokenId}</dd>
                </div>
              )}
            </dl>
            <div className="tool-detail-actions">
              <Button onClick={() => setRebind(agent)}>
                <Wrench />
                换模型 / 换绑密钥
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/setup/${agent.id}`)}
              >
                重新配置
                <ArrowRight />
              </Button>
              <Button
                variant="outline"
                onClick={() => void restore()}
                disabled={restoring}
              >
                {restoring ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RotateCcw />
                )}
                恢复备份
              </Button>
            </div>
          </section>
          <section className="tool-detail-files" aria-label="配置文件">
            <h2>
              <FileText aria-hidden="true" />
              程序写入的配置
            </h2>
            <p className="page-footnote">内容已脱敏，密钥一律以 • 显示。</p>
            {detail.configFiles.map((file) => (
              <div key={file.path} className="config-file">
                <div className="config-file-head">
                  <span className="mono">{file.path}</span>
                  {file.exists ? (
                    <span className="config-file-state ok">
                      <Check aria-hidden="true" />
                      已写入
                    </span>
                  ) : (
                    <span className="config-file-state">未创建</span>
                  )}
                </div>
                {file.content && (
                  <details>
                    <summary>
                      <Eye aria-hidden="true" />
                      查看内容
                    </summary>
                    <pre>{file.content}</pre>
                  </details>
                )}
              </div>
            ))}
          </section>
        </>
      )}
      <RebindDialog
        agent={rebind}
        onOpenChange={(open) => {
          if (!open) setRebind(null);
        }}
        onDone={() => {
          toast.success("配置已更新");
          void load();
        }}
      />
    </div>
  );
}
