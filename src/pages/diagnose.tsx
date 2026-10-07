import { useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  Monitor,
  Terminal,
  PlugZap,
  Copy,
  CircleDashed,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { StatusIcon } from "@/components/status";
import { useApp } from "@/lib/store";
import { isTauri, testConnection } from "@/lib/tauri/api";
import type { TestResult } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";

export default function DiagnosePage() {
  const { environment, agents, loading, refresh, error, draft } = useApp();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const tools = [...(environment?.tools ?? []), ...agents];
  const missing = tools.filter((t) => !t.installed);
  async function detect() {
    setResult(null);
    if (await refresh())
      toast.success("检测完成", {
        description: isTauri()
          ? "本机环境报告已更新。"
          : "演示检测结果已更新。",
      });
  }
  async function test() {
    if (isTauri() && !draft?.apiKey) {
      toast.info("请先完成本机连接配置", {
        description: "需要实际服务地址、模型和 API Key 才能测试。",
      });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const value = await testConnection(
        draft ?? { agentId: "codex", baseUrl: "", model: "", apiKey: "" },
      );
      setResult(value);
      if (value.ok) toast.success(value.message);
      else toast.error(value.message);
    } catch (e) {
      setResult({ ok: false, latencyMs: null, message: errorMessage(e) });
      toast.error(errorMessage(e));
    } finally {
      setTesting(false);
    }
  }
  return (
    <>
      <PageHeader
        title="系统诊断"
        description="了解本机状态，为顺畅的开发体验做好准备。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={detect}
            disabled={loading}
          >
            <RefreshCw className={cn(loading && "animate-spin")} />
            重新检测
          </Button>
        }
      />
      <section className="diagnostic-summary">
        <span
          className={cn("diagnostic-symbol", missing.length > 0 && "warning")}
        >
          {loading ? (
            <RefreshCw className="animate-spin" />
          ) : missing.length ? (
            <AlertTriangle />
          ) : (
            <CheckCircle2 />
          )}
        </span>
        <div>
          <h2>
            {loading
              ? "正在检查本机环境"
              : error
                ? "环境检测未完成"
                : missing.length
                  ? "基础环境就绪，部分工具尚未安装"
                  : "本机开发环境已就绪"}
          </h2>
          <p>
            {!isTauri()
              ? "当前显示演示检测结果。桌面端会读取真实安装状态。"
              : "检测仅用于读取本机状态，不会安装工具或修改配置。"}
          </p>
        </div>
        {environment && (
          <span className="version-pill">
            {environment.os} · {environment.arch}
          </span>
        )}
      </section>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="section-heading">
        <h2>
          <Monitor />
          开发环境与工具
        </h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading || !environment}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                [
                  isTauri() ? "KunCode 本机诊断" : "KunCode 演示诊断",
                  `${environment?.os} · ${environment?.arch}`,
                  ...tools.map(
                    (t) =>
                      `${t.name}: ${t.installed ? (t.version ?? "已安装") : "未安装"}`,
                  ),
                ].join("\n"),
              );
              toast.success("诊断摘要已复制", {
                description: "不包含 API Key 或账户信息。",
              });
            } catch {
              toast.error("复制失败，请检查剪贴板权限");
            }
          }}
        >
          <Copy />
          复制摘要
        </Button>
      </div>
      <section className="diagnostic-list">
        {tools.map((tool) => (
          <div className="diagnostic-row" key={tool.id}>
            <span className="diagnostic-tool-icon">
              <Terminal />
            </span>
            <div className="diagnostic-copy">
              <h3>{tool.name}</h3>
              <p>{tool.path ?? "尚未检测到可执行文件，安装后可重新检测。"}</p>
            </div>
            <span className="diagnostic-version">
              {tool.version ?? "未安装"}
            </span>
            <StatusIcon kind={tool.installed ? "ok" : "missing"} />
          </div>
        ))}
        {!tools.length && (
          <div className="empty-state">
            <CircleDashed />
            <p>
              {loading ? "正在读取环境信息…" : "暂无检测结果，请重新检测。"}
            </p>
          </div>
        )}
      </section>
      <div className="section-heading">
        <h2>
          <PlugZap />
          服务连接
        </h2>
      </div>
      <section className="connection-surface">
        <div>
          <h3>KunCode API</h3>
          <p>
            {result
              ? `${result.message}${result.latencyMs !== null ? ` · ${result.latencyMs} ms` : ""}`
              : "尚未测试 · 安装状态不代表服务可访问"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={test}
          disabled={testing || (isTauri() && !draft?.apiKey)}
        >
          {testing && <RefreshCw className="animate-spin" />}
          {isTauri() ? "测试连接" : "演示测试"}
        </Button>
      </section>
      <p className="page-footnote">
        <ShieldCheck />
        {isTauri()
          ? "使用连接配置中的凭据测试。尚未配置时，请先前往工具配置。"
          : "演示测试不会发送真实请求；未安装的工具不影响原型体验。"}
      </p>
    </>
  );
}
