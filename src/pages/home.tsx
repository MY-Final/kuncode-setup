import { useNavigate } from "react-router-dom";
import { ArrowRight, RefreshCw, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusIcon, StatusDot } from "@/components/status";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const agentAccent: Record<string, string> = {
  codex: "from-blue-500/10 to-blue-500/0",
  claude: "from-orange-500/10 to-orange-500/0",
  opencode: "from-violet-500/10 to-violet-500/0",
};

export default function HomePage() {
  const { agents, environment, loading, session, refresh } = useApp();
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="from-primary/8 to-primary/0 rounded-2xl border bg-gradient-to-br via-transparent p-8">
        <Badge variant="secondary" className="mb-4 gap-1">
          <Sparkles className="size-3" /> 专为 KunCode 用户打造
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">KunCode Setup</h1>
        <p className="text-muted-foreground mt-2 max-w-xl text-sm">
          AI Coding Agent 配置助手。无需理解 API Key、Base
          URL、环境变量或配置文件， 选择工具和模型即可完成本机配置并验证连接。
        </p>
        <div className="text-muted-foreground mt-5 flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <Zap className="size-3.5 text-primary" /> 自动备份 · 可回滚
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="size-3.5 text-primary" /> 一键检测 · 一键测试
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="size-3.5 text-primary" /> 支持 Codex / Claude Code /
            OpenCode
          </span>
        </div>
      </section>

      {/* Agent cards */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {session ? "我的 Coding Agents" : "选择要配置的工具"}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            重新检测
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {agents.map((agent) => (
            <Card
              key={agent.id}
              className={cn(
                "group relative overflow-hidden bg-gradient-to-br transition-shadow hover:shadow-md",
                agentAccent[agent.id],
              )}
            >
              <CardContent className="flex h-full flex-col p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{agent.name}</h3>
                  <Badge variant={agent.installed ? "success" : "secondary"}>
                    <StatusDot kind={agent.installed ? "ok" : "missing"} />
                    {agent.installed ? "已安装" : "未安装"}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1.5 flex-1 text-xs">
                  {agent.description}
                </p>
                {agent.version && (
                  <p className="text-muted-foreground/80 mt-2 truncate text-[11px]">
                    {agent.version}
                  </p>
                )}
                <Button
                  className="mt-4 w-full"
                  variant={agent.installed ? "default" : "outline"}
                  onClick={() => navigate(`/setup/${agent.id}`)}
                >
                  开始配置
                  <ArrowRight className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
          {agents.length === 0 && (
            <div className="text-muted-foreground col-span-3 py-10 text-center text-sm">
              {loading ? "正在检测本机环境…" : "未检测到可用工具"}
            </div>
          )}
        </div>
      </section>

      {/* Environment status */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">环境状态</h2>
        <Card>
          <CardContent className="p-0">
            <div className="divide-border divide-y">
              <EnvRow
                name="操作系统"
                value={
                  environment ? `${environment.os} · ${environment.arch}` : "—"
                }
                ok={!!environment}
              />
              {environment?.tools.map((tool) => (
                <EnvRow
                  key={tool.id}
                  name={tool.name}
                  value={tool.installed ? (tool.version ?? "已安装") : "未安装"}
                  ok={tool.installed}
                />
              ))}
              {agents.map((agent) => (
                <EnvRow
                  key={agent.id}
                  name={agent.name}
                  value={
                    agent.installed ? (agent.version ?? "已安装") : "未安装"
                  }
                  ok={agent.installed}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function EnvRow({
  name,
  value,
  ok,
}: {
  name: string;
  value: string;
  ok: boolean;
}) {
  const tool = value.startsWith("v") ? `Node.js ${value}` : value;
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-sm font-medium">{name}</span>
      <div className="flex items-center gap-2.5">
        <span className="text-muted-foreground max-w-[420px] truncate text-right text-xs">
          {tool}
        </span>
        <StatusIcon kind={ok ? "ok" : "missing"} />
      </div>
    </div>
  );
}
