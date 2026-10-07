import { AgentIcon } from "@/components/agent-icon";
import { DEMO_MODELS } from "@/lib/data/models";
import type { ConfigPreview } from "@/lib/types";
export function ConfigurationPreview({
  preview,
  demo,
}: {
  preview: ConfigPreview;
  demo: boolean;
}) {
  const model =
    (demo
      ? DEMO_MODELS.find((item) => item.id === preview.model)?.name
      : undefined) ?? preview.model;
  return (
    <div className="config-summary">
      <div className="preview-agent">
        <AgentIcon id={preview.agentId} />
        <div>
          <h2>{preview.agentName}</h2>
          <p>{model}</p>
        </div>
      </div>
      <p className="config-summary-note">
        {demo
          ? "程序将模拟保存配置，不会修改本机文件。"
          : "程序将自动保存配置，已有设置会先备份。"}
      </p>
      <details className="technical-details">
        <summary>查看详细配置</summary>
        <dl className="detail-list">
          <div>
            <dt>保存位置</dt>
            <dd className="mono">{preview.configPath ?? "由程序自动选择"}</dd>
          </div>
          <div>
            <dt>服务地址</dt>
            <dd className="mono">{preview.baseUrl}</dd>
          </div>
          <div>
            <dt>模型</dt>
            <dd>{preview.model}</dd>
          </div>
          <div>
            <dt>连接凭据</dt>
            <dd>{preview.maskedApiKey}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
