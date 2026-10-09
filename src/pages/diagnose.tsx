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
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/store";
import {
  isTauri,
  probeToolConnection,
  testConnection,
  testToolInference,
} from "@/lib/tauri/api";
import { installGuideFor, type InstallGuide } from "@/lib/data/install";
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
  const [inferenceAgent, setInferenceAgent] = useState<string | null>(null);
  const [guide, setGuide] = useState<{
    name: string;
    guide: InstallGuide;
  } | null>(null);
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
        const checks: PromiseSettledResult<TestResult>[] = [];
        for (const id of configured) {
          try {
            checks.push({
              status: "fulfilled",
              value: await probeToolConnection(id),
            });
          } catch (reason) {
            checks.push({ status: "rejected", reason });
          }
        }
        const failures = checks.filter(
          (value) => value.status === "rejected" || !value.value.ok,
        );
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
  function openGuide(id: string, name: string) {
    const value = installGuideFor(id);
    if (value) setGuide({ name, guide: value });
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
            ) : installGuideFor(tool.id) ? (
              <Button
                className="diagnostic-guide-action"
                variant="outline"
                size="sm"
                onClick={() => openGuide(tool.id, tool.name)}
              >
                查看安装方式
              </Button>
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
            <h3>模型服务</h3>
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
            {isTauri() ? "检查模型列表" : "演示检查"}
          </Button>
        </div>
      </section>
      {isTauri() && configured.length > 0 && (
        <section className="connection-section" aria-label="实际调用测试">
          <h2>测试实际调用</h2>
          <p className="page-footnote">
            向所选工具的默认模型发送一次短请求，验证实际调用和
            Streaming；会消耗少量额度。
          </p>
          <div className="connection-entry">
            {configured.map((id) => (
              <Button
                key={id}
                variant="outline"
                disabled={testing}
                onClick={() => setInferenceAgent(id)}
              >
                测试 {agents.find((agent) => agent.id === id)?.name ?? id}
              </Button>
            ))}
          </div>
        </section>
      )}
      {result && (
        <p className="page-footnote" role="status">
          {result.message}
        </p>
      )}
      {isTauri() && !configured.length && (
        <p className="page-footnote">请先完成工具配置，再检查服务连接。</p>
      )}
      <Dialog
        open={inferenceAgent !== null}
        onOpenChange={(open) => {
          if (!open) setInferenceAgent(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>测试实际调用与 Streaming</DialogTitle>
            <DialogDescription>
              向默认模型发送一次短请求，会消耗少量额度。模型响应内容不会保存。
            </DialogDescription>
          </DialogHeader>
          <div className="setup-form-footer">
            <Button variant="outline" onClick={() => setInferenceAgent(null)}>
              取消
            </Button>
            <Button
              onClick={async () => {
                if (!inferenceAgent || testing) return;
                const id = inferenceAgent;
                setInferenceAgent(null);
                setTesting(true);
                setResult(null);
                try {
                  setResult(await testToolInference(id));
                } catch (value) {
                  setResult({
                    ok: false,
                    latencyMs: null,
                    message: errorMessage(value),
                  });
                } finally {
                  await refreshConnections().catch(() => undefined);
                  setTesting(false);
                }
              }}
            >
              开始测试
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={guide !== null}
        onOpenChange={(open) => {
          if (!open) setGuide(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>安装 {guide?.name}</DialogTitle>
            <DialogDescription>
              安装完成后回到本页点「重新检查」即可。
            </DialogDescription>
          </DialogHeader>
          {guide?.guide.note && (
            <p className="page-footnote">{guide.guide.note}</p>
          )}
          {guide?.guide.commands.length ? (
            <div className="install-commands">
              {guide.guide.commands.map((command) => (
                <code key={command}>{command}</code>
              ))}
            </div>
          ) : null}
          <div className="setup-form-footer">
            <Button variant="outline" onClick={() => setGuide(null)}>
              关闭
            </Button>
            <Button asChild>
              <a href={guide?.guide.docs} target="_blank" rel="noreferrer">
                打开官方文档
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
