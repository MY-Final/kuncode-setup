import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FlaskConical,
  Loader2,
  ShieldCheck,
  Terminal,
  KeyRound,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { AgentIcon } from "@/components/agent-icon";
import { SetupStepper } from "@/components/setup/stepper";
import { ConfigurationPreview } from "@/components/setup/config-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useApp } from "@/lib/store";
import * as api from "@/lib/tauri/api";
import {
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
  DEMO_MODELS,
} from "@/lib/data/models";
import type { AgentConfig, ConfigPreview, StepResult } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

type Stage = "connect" | "preview" | "applying" | "done";
export default function SetupPage() {
  const { agent: agentId = "codex" } = useParams();
  const {
    agents,
    loading,
    session,
    login,
    draft,
    setDraft,
    recordConfiguration,
  } = useApp();
  const agent = agents.find((a) => a.id === agentId);
  const matchingDraft = draft?.agentId === agentId ? draft : null;
  const [stage, setStage] = useState<Stage>("connect");
  const [demo, setDemo] = useState(true);
  const [account, setAccount] = useState(session?.account ?? "演示用户");
  const [model, setModel] = useState(matchingDraft?.model ?? DEFAULT_MODEL);
  const [baseUrl, setBaseUrl] = useState(
    matchingDraft?.baseUrl ?? DEFAULT_BASE_URL,
  );
  const [apiKey, setApiKey] = useState("");
  const [preview, setPreview] = useState<ConfigPreview | null>(null);
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState(false);
  const navigate = useNavigate();
  const config: AgentConfig = {
    agentId,
    model: model.trim(),
    baseUrl: baseUrl.trim().replace(/\/+$/, ""),
    apiKey: demo ? "" : apiKey.trim(),
  };
  const success = steps.length > 0 && steps.every((s) => s.ok);
  const wrote = steps.some((s) => s.step === "写入配置" && s.ok);
  const safeError = (e: unknown) => {
    const message = errorMessage(e);
    return apiKey.trim()
      ? message.split(apiKey.trim()).join("[凭据已隐藏]")
      : message;
  };
  async function handlePreview(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!demo) {
      if (!config.apiKey || !config.model) {
        setError("请输入模型 ID 与 API Key。");
        return;
      }
      try {
        const url = new URL(config.baseUrl);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error();
      } catch {
        setError(
          "请输入有效的 HTTP / HTTPS 服务地址，且不要在地址中包含凭据。",
        );
        return;
      }
    }
    setBusy(true);
    try {
      const value = await api.previewConfig(config, demo);
      setPreview(value);
      setStage("preview");
      if (demo) login(account.trim() || "演示用户");
      setDraft(config);
    } catch (e) {
      setError(safeError(e));
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (busy || (!demo && !agent?.installed)) return;
    setBusy(true);
    setStage("applying");
    setError(null);
    setSteps([]);
    try {
      const result = await api.applyConfig(config, demo);
      setSteps(result);
      setStage("done");
      if (result.some((s) => s.step === "写入配置" && s.ok))
        recordConfiguration(agentId, config.model, demo);
      if (result.length > 0 && result.every((s) => s.ok))
        toast.success(demo ? "演示配置已完成" : "配置完成，连接测试通过");
      else {
        setError("部分步骤未完成，请查看下方结果。备份恢复界面尚未接入。");
        toast.error("配置未全部完成");
      }
    } catch (e) {
      setError(safeError(e));
      setStage("preview");
    } finally {
      setBusy(false);
    }
  }
  async function launch() {
    setBusy(true);
    try {
      const message = await api.launchAgent(agentId, demo);
      setLaunched(true);
      toast.success(message);
    } catch (e) {
      setError(safeError(e));
    } finally {
      setBusy(false);
    }
  }
  async function retest() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.testConnection(config, demo);
      setSteps((previous) => [
        ...previous.filter((s) => s.step !== "测试连接"),
        { step: "测试连接", ok: result.ok, detail: result.message },
      ]);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (e) {
      setError(safeError(e));
    } finally {
      setBusy(false);
    }
  }
  if (!agent)
    return (
      <>
        <PageHeader
          title={loading ? "正在检测工具…" : "未找到这个工具"}
          description={
            loading
              ? "正在准备本机工具信息。"
              : "请返回工作台，重新选择需要配置的工具。"
          }
        />
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft />
          返回工作台
        </Button>
      </>
    );
  return (
    <>
      <PageHeader
        title={`配置 ${agent.name}`}
        description="从连接到就绪，每一步都清晰可见。"
        actions={
          <Button
            asChild
            variant="ghost"
            size="sm"
            disabled={stage === "applying"}
          >
            <Link
              to="/models"
              onClick={(e) => {
                if (stage === "applying") e.preventDefault();
              }}
            >
              <ArrowLeft />
              返回工具配置
            </Link>
          </Button>
        }
      />
      <div className="setup-container">
        <SetupStepper
          step={stage === "connect" ? 0 : stage === "preview" ? 1 : 2}
        />
        {error && (
          <div className="inline-error" role="alert">
            <CircleAlert />
            {error}
          </div>
        )}
        <section
          className={`setup-surface ${stage === "preview" ? "setup-preview-surface" : ""}`}
        >
          {stage === "connect" && (
            <>
              <div className="setup-tool-head">
                <AgentIcon id={agent.id} />
                <div>
                  <h2>{agent.name}</h2>
                  <p>选择连接方式，准备你的配置。</p>
                </div>
              </div>
              <Tabs
                value={demo ? "demo" : "native"}
                onValueChange={(value) => {
                  setDemo(value === "demo");
                  setError(null);
                }}
                className="connection-tabs"
              >
                <TabsList>
                  <TabsTrigger
                    value="demo"
                    id="connection-demo"
                    aria-controls="connection-panel"
                  >
                    <FlaskConical />
                    演示体验
                  </TabsTrigger>
                  <TabsTrigger
                    value="native"
                    id="connection-native"
                    aria-controls="connection-panel"
                    disabled={!api.isTauri()}
                  >
                    <KeyRound />
                    本机配置{!api.isTauri() && " · 桌面端可用"}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <form
                onSubmit={handlePreview}
                className="connection-form"
                id="connection-panel"
                role="tabpanel"
                aria-labelledby={demo ? "connection-demo" : "connection-native"}
              >
                <div className="mode-notice">
                  {demo ? (
                    <>
                      <FlaskConical />
                      <p>
                        <strong>先体验完整流程，无需真实凭据</strong>
                        <span>
                          登录服务尚未接入。此模式不会修改文件或发送请求。
                        </span>
                      </p>
                    </>
                  ) : (
                    <>
                      <ShieldCheck />
                      <p>
                        <strong>使用你自己的 KunCode 连接信息</strong>
                        <span>仅调用本机 Rust 能力，不使用演示凭据。</span>
                      </p>
                    </>
                  )}
                </div>
                {demo ? (
                  <div className="form-field">
                    <Label htmlFor="demo-account">演示显示名称</Label>
                    <Input
                      id="demo-account"
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                      maxLength={40}
                      placeholder="例如：开发者"
                    />
                    <small>仅用于演示会话，不是实际账户登录。</small>
                  </div>
                ) : (
                  <div className="form-field">
                    <Label htmlFor="base-url">服务地址</Label>
                    <Input
                      id="base-url"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder={DEFAULT_BASE_URL}
                      required
                    />
                  </div>
                )}
                <div className="form-field">
                  <Label htmlFor="setup-model">
                    {demo ? "配置模型" : "模型 ID"}
                  </Label>
                  {demo ? (
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger id="setup-model" className="w-full">
                        <SelectValue placeholder="选择模型" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEMO_MODELS.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="setup-model"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="填写服务端实际支持的模型 ID"
                      required
                    />
                  )}
                  <small>
                    {demo
                      ? "演示模型目录，不代表服务端实时可用性。"
                      : "请使用账户实际支持的模型 ID。上一步目录仅供演示。"}
                  </small>
                </div>
                {!demo && (
                  <div className="form-field">
                    <Label htmlFor="api-key">API Key</Label>
                    <Input
                      id="api-key"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="输入你的 API Key"
                      required
                    />
                    <small>
                      仅在内存中使用；写入时保存到所选工具的本机配置。
                    </small>
                  </div>
                )}
                <div className="setup-form-footer">
                  <span>
                    <ShieldCheck />
                    确认前不修改文件
                  </span>
                  <Button type="submit" disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : null}预览配置{" "}
                    <ArrowRight />
                  </Button>
                </div>
              </form>
            </>
          )}
          {stage === "preview" && preview && (
            <>
              <div className="setup-preview-body">
                <ConfigurationPreview preview={preview} demo={demo} />
                {!demo && !agent.installed && (
                  <p className="inline-error">
                    尚未检测到 {agent.name}
                    。请先安装工具，再回到系统诊断重新检测。
                  </p>
                )}
              </div>
              <div className="setup-form-footer">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStage("connect");
                    setError(null);
                  }}
                >
                  <ArrowLeft />
                  调整配置
                </Button>
                <Button
                  onClick={apply}
                  disabled={busy || (!demo && !agent.installed)}
                >
                  {demo ? <Play /> : <ShieldCheck />}
                  {demo ? "运行演示配置" : "备份并写入配置"}
                </Button>
              </div>
            </>
          )}
          {stage === "applying" && (
            <div className="applying-state">
              <Loader2 className="animate-spin" />
              <h2>{demo ? "正在运行演示流程" : "正在配置工具"}</h2>
              <p>检查工具、备份配置并验证连接，请稍候。</p>
              <Progress value={undefined} className="indeterminate-progress" />
              <small>
                {demo ? "不会改动本机文件" : "请保持窗口打开，等待结果"}
              </small>
            </div>
          )}
          {stage === "done" && (
            <>
              <div className={`result-heading ${success ? "success" : ""}`}>
                {success ? <CheckCircle2 /> : <CircleAlert />}
                <h2>
                  {success
                    ? demo
                      ? "演示配置完成"
                      : `${agent.name} 已准备就绪`
                    : wrote
                      ? "配置已写入，请检查连接"
                      : "配置尚未完成"}
                </h2>
                <p>
                  {demo
                    ? "你已体验完整配置流程，本机文件未被修改。"
                    : `${agent.name} · ${config.model}`}
                </p>
              </div>
              <div className="result-steps">
                {steps.map((step) => (
                  <div key={step.step}>
                    {step.ok ? (
                      <CheckCircle2 className="text-success" />
                    ) : (
                      <CircleAlert className="text-destructive" />
                    )}
                    <div>
                      <strong>{step.step}</strong>
                      <p>{step.detail ?? "完成"}</p>
                    </div>
                    <span>{step.ok ? "完成" : "需处理"}</span>
                  </div>
                ))}
              </div>
              <div className="setup-form-footer">
                <Button variant="outline" onClick={() => navigate("/")}>
                  返回工作台
                </Button>
                {success ? (
                  <Button onClick={launch} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <Terminal />}
                    {launched
                      ? "再次启动"
                      : demo
                        ? "演示启动工具"
                        : `启动 ${agent.name}`}
                  </Button>
                ) : wrote ? (
                  <Button onClick={retest} disabled={busy}>
                    {busy && <Loader2 className="animate-spin" />}重新测试连接
                  </Button>
                ) : (
                  <Button onClick={() => setStage("preview")}>
                    返回配置预览
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
        <p className="page-footnote">
          <ShieldCheck />
          {demo
            ? "演示体验独立于本机能力，随时可以重新配置。"
            : "已有配置由 Rust 自动备份。首版暂不提供备份恢复界面。"}
        </p>
      </div>
    </>
  );
}
