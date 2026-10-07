import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Rocket,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useApp } from "@/lib/store";
import * as api from "@/lib/tauri/api";
import type { ConfigPreview, StepResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type Stage = "login" | "preview" | "applying" | "done";

export default function SetupPage() {
  const { agent: agentId = "codex" } = useParams();
  const { agents, session, login, draft } = useApp();
  const agent = useMemo(
    () => agents.find((a) => a.id === agentId),
    [agents, agentId],
  );

  const [stage, setStage] = useState<Stage>(session ? "preview" : "login");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [model] = useState(draft?.model ?? "gpt-5.6-luna");
  const [preview, setPreview] = useState<ConfigPreview | null>(null);
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<string | null>(null);
  const navigate = useNavigate();

  const config = {
    agentId,
    model,
    baseUrl: draft?.baseUrl ?? "https://api.kuncode.ai/v1",
    apiKey: draft?.apiKey ?? "sk-kuncode-demo-key-1234",
  };

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // MVP：登录 + Setup Token 由服务端 API 完成。
    // 这里先落地客户端流程骨架，真实鉴权接入 /api/setup/auth。
    if (!account.trim()) {
      setError("请输入账号");
      return;
    }
    login(account.trim());
    setStage("preview");
    try {
      const p = await api.previewConfig(config);
      setPreview(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleApply() {
    setStage("applying");
    setError(null);
    setSteps([]);
    setProgress(10);
    try {
      const result = await api.applyConfig(config);
      setSteps(result);
      setProgress(100);
      if (result.every((s) => s.ok)) {
        setStage("done");
      } else {
        setError("配置过程中出现问题，原配置已保留，可恢复备份后重试。");
        setStage("preview");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("preview");
    }
  }

  async function handleLaunch() {
    try {
      const msg = await api.launchAgent(agentId);
      setLaunched(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!agent) {
    return (
      <div className="max-w-xl">
        <Alert variant="destructive">
          <AlertTitle>未知的 Agent</AlertTitle>
          <AlertDescription>
            找不到「{agentId}」，请返回首页重新选择。
          </AlertDescription>
        </Alert>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="size-4" /> 返回首页
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`配置 ${agent.name}`}
        description={agent.description}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" /> 返回
            </Link>
          </Button>
        }
      />

      {/* Stepper */}
      <div className="mb-6 flex items-center gap-2 text-xs">
        {(["login", "preview", "applying", "done"] as Stage[]).map((s, i) => {
          const labels = {
            login: "登录",
            preview: "确认",
            applying: "写入",
            done: "完成",
          };
          const order = ["login", "preview", "applying", "done"];
          const active = order.indexOf(stage) >= i;
          return (
            <div key={s} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  active
                    ? "text-foreground font-medium"
                    : "text-muted-foreground",
                )}
              >
                {labels[s]}
              </span>
              {i < 3 && (
                <span
                  className={cn(
                    "h-px flex-1",
                    active ? "bg-primary/40" : "bg-border",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <XCircle />
          <AlertTitle>出错了</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {stage === "login" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">登录 KunCode</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account">账号</Label>
                <Input
                  id="account"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="你的 KunCode 账号"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full">
                <Lock className="size-4" /> 登录
              </Button>
              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                <Separator className="flex-1" />
                或
                <Separator className="flex-1" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled
              >
                使用浏览器授权（即将支持）
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {stage === "preview" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">准备配置 {agent.name}</CardTitle>
            <Badge variant="secondary">
              <ShieldCheck className="size-3" /> 自动备份
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <PreviewRow label="Provider" value="KunCode" />
              <Separator />
              <PreviewRow
                label="Base URL"
                value={preview?.baseUrl ?? config.baseUrl}
                mono
              />
              <Separator />
              <PreviewRow label="模型" value={preview?.model ?? model} />
              <Separator />
              <PreviewRow
                label="API Key"
                value={preview?.maskedApiKey ?? "sk-••••••••1234"}
                mono
              />
              <Separator />
              <PreviewRow
                label="配置文件"
                value={preview?.configPath ?? "待检测"}
                mono
              />
            </div>

            <Alert>
              <CheckCircle2 className="text-success" />
              <AlertTitle>原配置将自动备份</AlertTitle>
              <AlertDescription>
                {preview?.existingConfig
                  ? `检测到已有配置，将备份到 ${preview.backupPath}`
                  : "未检测到原配置，将直接创建新配置。"}
              </AlertDescription>
            </Alert>

            <div className="flex justify-between gap-3 pt-1">
              <Button variant="outline" onClick={() => setStage("login")}>
                <ArrowLeft className="size-4" /> 返回
              </Button>
              <Button onClick={handleApply}>
                <Rocket className="size-4" /> 开始配置
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "applying" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">正在配置 {agent.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} />
            <div className="space-y-2.5">
              {steps.length === 0 ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" /> 正在执行…
                </div>
              ) : (
                steps.map((s) => (
                  <div
                    key={s.step}
                    className="flex items-start gap-2.5 text-sm"
                  >
                    {s.ok ? (
                      <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" />
                    ) : (
                      <XCircle className="text-destructive mt-0.5 size-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium">{s.step}</div>
                      {s.detail && (
                        <div className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                          {s.detail}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "done" && (
        <Card>
          <CardContent className="space-y-5 p-8 text-center">
            <div className="bg-success/10 mx-auto flex size-14 items-center justify-center rounded-full">
              <CheckCircle2 className="text-success size-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                🎉 {agent.name} 配置完成
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                KunCode API 正常 · {model} 可用
              </p>
            </div>

            <div className="bg-secondary/50 mx-auto max-w-sm space-y-2 rounded-lg p-4 text-left text-sm">
              {steps.map((s) => (
                <div key={s.step} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{s.step}</span>
                  <span className="flex items-center gap-1.5 font-medium">
                    {s.ok ? (
                      <CheckCircle2 className="text-success size-3.5" />
                    ) : (
                      <XCircle className="text-destructive size-3.5" />
                    )}
                    {s.ok ? "成功" : "失败"}
                  </span>
                </div>
              ))}
            </div>

            {launched && <p className="text-success text-xs">{launched}</p>}

            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => navigate("/")}>
                返回首页
              </Button>
              <Button onClick={handleLaunch}>
                <Rocket className="size-4" /> 启动 {agent.name}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PreviewRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span
        className={cn(
          "truncate text-right font-medium",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </span>
    </div>
  );
}
