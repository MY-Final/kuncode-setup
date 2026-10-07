import { ShieldCheck, FileCode2 } from "lucide-react";
import type { ConfigPreview } from "@/lib/types";
export function ConfigurationPreview({
  preview,
  demo,
}: {
  preview: ConfigPreview;
  demo: boolean;
}) {
  return (
    <>
      <div className="config-preview-heading">
        <FileCode2 />
        <div>
          <h2>确认即将使用的配置</h2>
          <p>
            {demo
              ? "这是一次演示，不会修改本机文件。"
              : "确认后，以下配置将写入本机。"}
          </p>
        </div>
      </div>
      <dl className="detail-list">
        <div>
          <dt>服务提供方</dt>
          <dd>{preview.provider}</dd>
        </div>
        <div>
          <dt>服务地址</dt>
          <dd className="mono">{preview.baseUrl}</dd>
        </div>
        <div>
          <dt>默认模型</dt>
          <dd>{preview.model}</dd>
        </div>
        <div>
          <dt>API Key</dt>
          <dd className="mono">{preview.maskedApiKey}</dd>
        </div>
        <div>
          <dt>配置文件</dt>
          <dd className="mono">{preview.configPath ?? "暂未定位到路径"}</dd>
        </div>
      </dl>
      <div className="backup-notice">
        <ShieldCheck />
        <div>
          <strong>
            {demo
              ? "演示备份流程"
              : preview.existingConfig
                ? "检测到已有配置，将先自动备份"
                : "将创建新的工具配置"}
          </strong>
          <p>
            {demo
              ? "下方操作会模拟备份、写入与连接测试。"
              : (preview.backupPath ?? "未检测到原配置，无需备份。")}
          </p>
        </div>
      </div>
      <div className="changes-list">
        <h3>本次改动</h3>
        {preview.changes.map((change) => (
          <p key={change}>
            <span />
            {change}
          </p>
        ))}
      </div>
    </>
  );
}
