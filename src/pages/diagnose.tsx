import { useState } from "react";
import {
  RefreshCw,
  Check,
  Monitor,
  Terminal,
  Hexagon,
  GitBranch,
  PlugZap,
  Circle,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { isTauri, probeToolConnection, testConnection } from "@/lib/tauri/api";
import type { TestResult } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
export default function DiagnosePage() {
  const {
    environment,
    agents,
    loading,
    refresh,
    refreshConnections,
    error,
    configurations,
  } = useApp();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const tools = [...(environment?.tools ?? []), ...agents];
  const configured = Object.keys(configurations).filter(
    (id) => !configurations[id].demo,
  );
  async function detect() {
    setResult(null);
    await refresh();
  }
  async function test() {
    if (testing || (isTauri() && !configured.length)) return;
    setTesting(true);
    setResult(null);
    try {
      if (isTauri()) {
        const checks = await Promise.allSettled(
          configured.map((id) => probeToolConnection(id)),
        );
        const failures = checks.filter((value) => value.status === "rejected");
        setResult({
          ok: !failures.length,
          latencyMs: null,
          message: checks
            .map(
              (value, index) =>
                `${agents.find((agent) => agent.id === configured[index])?.name ?? configured[index]}：${value.status === "fulfilled" ? value.value.message : errorMessage(value.reason)}`,
            )
            .join("；"),
        });
        await refreshConnections();
      } else
        setResult(
          await testConnection(
            { agentId: "codex", baseUrl: "", model: "", apiKey: "" },
            true,
          ),
        );
    } catch (e) {
      setResult({
        ok: false,
        latencyMs: null,
        message: errorMessage(e),
      });
    } finally {
      setTesting(false);
    }
  }
  function icon(id: string) {
    return id === "node" || id === "npm" ? (
      <Hexagon />
    ) : id === "git" ? (
      <GitBranch />
    ) : (
      <Terminal />
    );
  }
  return (
    <div className="diagnose-page">
      <PageHeader
        title="系统诊断"
        description="检查工具和连接，找到问题所在。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void detect()}
            disabled={loading}
          >
            <RefreshCw className={cn(loading && "animate-spin")} />
            重新检查
          </Button>
        }
      />
      {!isTauri() && (
        <p className="diagnostic-summary">
          当前为演示结果，Windows 应用会检查本机实际状态。
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <section
        className="diagnostic-list"
        aria-label="系统检查结果"
        aria-busy={loading}
      >
        <div className="diagnostic-row">
          <span className="diagnostic-tool-icon">
            <Monitor />
          </span>
          <div className="diagnostic-copy">
            <h3>操作系统</h3>
          </div>
          <span className={cn("diagnostic-status", environment && "ok")}>
            {environment ? "正常" : loading ? "检查中" : "尚未检查"}
          </span>
          <span className="diagnostic-version">
            {environment
              ? `${environment.os} (${environment.arch === "x86_64" ? "64 位" : environment.arch})`
              : "—"}
          </span>
          {environment ? (
            <Check className="text-success" aria-hidden="true" />
          ) : (
            <Circle className="text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        {tools.map((tool) => (
          <div className="diagnostic-row" key={tool.id}>
            <span className="diagnostic-tool-icon">{icon(tool.id)}</span>
            <div className="diagnostic-copy">
              <h3>{tool.name}</h3>
            </div>
            <span
              className={cn(
                "diagnostic-status",
                tool.installed ? "ok" : "missing",
              )}
            >
              {tool.installed ? "已安装" : "未安装"}
            </span>
            <span className="diagnostic-version">
              {tool.version?.replace(
                /^(git version |codex |claude |opencode )/,
                "",
              ) ?? "—"}
            </span>
            {tool.installed ? (
              <Check className="text-success" aria-hidden="true" />
            ) : (
              <AlertTriangle className="text-warning" aria-hidden="true" />
            )}
          </div>
        ))}
        <div className="diagnostic-row">
          <span className="diagnostic-tool-icon">
            <PlugZap />
          </span>
          <div className="diagnostic-copy">
            <h3>KunCode API</h3>
          </div>
          <span
            className={cn(
              "diagnostic-status",
              result && (result.ok ? "ok" : "missing"),
            )}
          >
            {testing
              ? "检查中"
              : result
                ? result.ok
                  ? isTauri()
                    ? "可访问"
                    : "演示通过"
                  : "未通过"
                : "尚未检查"}
          </span>
          <span className="diagnostic-version">
            {result?.latencyMs != null ? `${result.latencyMs} ms` : "—"}
          </span>
          <Button
            className="diagnostic-api-action"
            variant="outline"
            size="sm"
            onClick={() => void test()}
            disabled={testing || (isTauri() && !configured.length)}
          >
            {testing && <RefreshCw className="animate-spin" />}
            {isTauri() ? "检查连接" : "演示检查"}
          </Button>
        </div>
      </section>
      {result && (
        <p className="page-footnote" role="status">
          {result.message}
        </p>
      )}
      {isTauri() && !configured.length && (
        <p className="page-footnote">请先完成工具配置，再检查服务连接。</p>
      )}
    </div>
  );
}
