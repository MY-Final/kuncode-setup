import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SetupStepper } from "@/components/setup/stepper";
import { ConfigurationPreview } from "@/components/setup/config-preview";
import {
  OperationDialog,
  type OperationState,
  type OperationStep,
} from "@/components/operation-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useApp } from "@/lib/store";
import { useAgentLaunch } from "@/lib/use-agent-launch";
import * as api from "@/lib/tauri/api";
import {
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
  DEMO_MODELS,
} from "@/lib/data/models";
import type { AgentConfig, ConfigPreview, StepResult } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
type Stage = "connect" | "model" | "preview";
const executionLabels = [
  "检查工具",
  "备份设置",
  "保存配置",
  "测试 KunCode 连接",
];

export default function SetupPage() {
  const { agent: agentId = "codex" } = useParams();
  const {
    agents,
    loading,
    login,
    draft,
    setDraft,
    configurations,
    recordConfiguration,
  } = useApp();
  const agent = agents.find((item) => item.id === agentId);
  const matchingDraft = draft?.agentId === agentId ? draft : null;
  const canReuseConnection =
    !!matchingDraft &&
    (configurations[agentId]?.demo || !!matchingDraft.apiKey);
  const [stage, setStage] = useState<Stage>(
    canReuseConnection ? "model" : "connect",
  );
  const [demo, setDemo] = useState(
    !canReuseConnection || !matchingDraft?.apiKey,
  );
  const [model, setModel] = useState(
    matchingDraft?.model ?? configurations[agentId]?.model ?? DEFAULT_MODEL,
  );
  const [baseUrl, setBaseUrl] = useState(
    matchingDraft?.baseUrl ?? DEFAULT_BASE_URL,
  );
  const [apiKey, setApiKey] = useState(matchingDraft?.apiKey ?? "");
  const [preview, setPreview] = useState<ConfigPreview | null>(null);
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [results, setResults] = useState<StepResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applying = useRef(false);
  const launcher = useAgentLaunch();
  const navigate = useNavigate();
  const config: AgentConfig = {
    agentId,
    model: model.trim(),
    baseUrl: baseUrl.trim().replace(/\/+$/, ""),
    apiKey: demo ? "" : apiKey.trim(),
  };
  useEffect(() => {
    document.getElementById("main-content")?.scrollTo(0, 0);
  }, [stage]);
  function safeError(value: unknown) {
    const message = errorMessage(value);
    return apiKey.trim()
      ? message.split(apiKey.trim()).join("[凭据已隐藏]")
      : message;
  }
  function connect(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!config.apiKey) {
      setError("请填写账户连接凭据。");
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
      setError("服务地址无效，请检查后再试。");
      return;
    }
    setDemo(false);
    setStage("model");
  }
  async function handlePreview(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!config.model) {
      setError("请选择模型。");
      return;
    }
    setBusy(true);
    try {
      setPreview(await api.previewConfig(config, demo));
      setDraft(config);
      setStage("preview");
    } catch (e) {
      setError(safeError(e));
    } finally {
      setBusy(false);
    }
  }
  function resultSteps(values: StepResult[], running = false): OperationStep[] {
    return executionLabels.map((label, index) => ({
      label: index === 0 ? `检查 ${agent?.name ?? "工具"}` : label,
      status: values[index]
        ? values[index].ok
          ? "complete"
          : "error"
        : running && index === values.length
          ? "running"
          : "waiting",
    }));
  }
  async function apply() {
    if (applying.current || (!demo && !agent?.installed)) return;
    applying.current = true;
    setResults([]);
    setError(null);
    const state: OperationState = {
      title: `正在配置 ${agent?.name}`,
      description: demo
        ? "演示配置，不会修改本机文件。"
        : "程序会自动备份、保存设置并检查连接。",
      phase: "running",
      steps: resultSteps([], true),
    };
    setOperation(state);
    const partial: StepResult[] = [];
    try {
      const values = await api.applyConfig(config, demo, (step) => {
        partial.push(step);
        setOperation({
          ...state,
          steps: resultSteps(partial, true),
          progress: (partial.length / 4) * 100,
        });
      });
      setResults(values);
      const success = values.length > 0 && values.every((step) => step.ok);
      recordConfiguration(
        agentId,
        config.model,
        demo,
        success ? "ready" : "error",
      );
      setOperation({
        ...state,
        title: success ? `${agent?.name} 配置完成` : "配置未完成",
        description: success
          ? demo
            ? "演示已完成，可以继续体验启动。"
            : "配置已保存，可以启动工具了。"
          : "请检查连接后重试。",
        phase: success ? "success" : "error",
        steps: resultSteps(values),
        progress: (values.length / 4) * 100,
        error: success
          ? undefined
          : values.find((step) => !step.ok)?.detail
            ? safeError(values.find((step) => !step.ok)!.detail)
            : "请到系统诊断检查工具与连接状态。",
      });
    } catch (e) {
      recordConfiguration(agentId, config.model, demo, "error");
      setOperation({
        ...state,
        title: "配置未完成",
        phase: "error",
        steps: resultSteps(partial),
        progress: (partial.length / 4) * 100,
        error: safeError(e),
      });
    } finally {
      applying.current = false;
    }
  }
  async function retest() {
    if (applying.current) return;
    applying.current = true;
    const state: OperationState = {
      title: "正在检查 KunCode 连接",
      description: demo
        ? "演示测试，不会发送真实请求。"
        : "请稍候，正在验证连接。",
      phase: "running",
      steps: [{ label: "测试 KunCode 连接", status: "running" }],
    };
    setOperation(state);
    try {
      const value = await api.testConnection(config, demo);
      const updated = [
        ...results.filter((step) => step.step !== "测试连接"),
        { step: "测试连接", ok: value.ok, detail: value.message },
      ];
      setResults(updated);
      const ready = updated.every((step) => step.ok);
      recordConfiguration(
        agentId,
        config.model,
        demo,
        ready ? "ready" : "error",
      );
      setOperation({
        ...state,
        title: ready ? "连接检查通过" : "连接未通过",
        description: ready ? "现在可以启动工具了。" : "请修复连接后重试。",
        phase: ready ? "success" : "error",
        steps: [
          {
            label: "测试 KunCode 连接",
            status: value.ok ? "complete" : "error",
          },
        ],
        progress: 100,
        error: value.ok ? undefined : safeError(value.message),
      });
    } catch (e) {
      setOperation({
        ...state,
        title: "连接未通过",
        phase: "error",
        steps: [{ label: "测试 KunCode 连接", status: "error" }],
        progress: 0,
        error: safeError(e),
      });
    } finally {
      applying.current = false;
    }
  }
  function closeOperation() {
    const completed = operation?.phase === "success";
    setOperation(null);
    if (completed) navigate("/");
  }
  function launchConfigured() {
    if (!agent) return;
    setOperation(null);
    void launcher.launch(agent);
  }
  if (!agent)
    return (
      <>
        <PageHeader title={loading ? "正在准备工具…" : "未找到这个工具"} />
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft />
          返回首页
        </Button>
      </>
    );
  return (
    <>
      <button
        type="button"
        className="flow-back"
        onClick={() => {
          setError(null);
          if (stage === "connect") navigate("/");
          else setStage(stage === "preview" ? "model" : "connect");
        }}
        disabled={busy}
      >
        <ArrowLeft />
        返回
      </button>
      <PageHeader
        title={
          stage === "connect"
            ? `配置 ${agent.name}`
            : stage === "model"
              ? "选择模型"
              : "确认配置"
        }
        description={
          stage === "connect"
            ? "连接账户，然后选择模型。"
            : stage === "model"
              ? "选择适合你的模型，其他设置交给程序。"
              : "确认后即可自动配置工具。"
        }
      />
      <div className="setup-container">
        <SetupStepper
          step={stage === "connect" ? 0 : stage === "model" ? 1 : 2}
        />
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {stage === "connect" && (
          <section className="connection-section">
            <h2>连接 KunCode</h2>
            <p>账户登录服务暂未接入，你可以先体验配置流程。</p>
            <Button variant="outline" disabled>
              登录 KunCode
            </Button>
            <Button
              onClick={() => {
                setDemo(true);
                login("演示用户");
                setStage("model");
              }}
              className="demo-entry"
            >
              体验配置流程
              <ArrowRight />
            </Button>
            {api.isTauri() && (
              <details
                className="technical-details connection-details"
                onToggle={(event) => setDemo(!event.currentTarget.open)}
              >
                <summary>使用已有连接信息</summary>
                <form onSubmit={connect}>
                  <div className="form-field">
                    <Label htmlFor="connection-credential">账户连接凭据</Label>
                    <Input
                      id="connection-credential"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="粘贴账户提供的连接凭据"
                      required
                    />
                  </div>
                  <details className="technical-details">
                    <summary>更改服务地址（可选）</summary>
                    <div className="form-field">
                      <Label htmlFor="base-url">服务地址</Label>
                      <Input
                        id="base-url"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        required
                      />
                    </div>
                  </details>
                  <Button type="submit">
                    继续
                    <ArrowRight />
                  </Button>
                </form>
              </details>
            )}
            {!api.isTauri() && (
              <p className="page-footnote">
                当前为浏览器演示，本机配置在 Windows 应用中完成。
              </p>
            )}
          </section>
        )}
        {stage === "model" && (
          <form onSubmit={handlePreview}>
            <RadioGroup
              value={model}
              onValueChange={setModel}
              className="setup-models"
              aria-label="选择模型"
              onFocusCapture={(event) => {
                if (
                  event.target instanceof HTMLButtonElement &&
                  event.target.getAttribute("role") === "radio"
                )
                  setModel(event.target.value);
              }}
            >
              {DEMO_MODELS.map((item, index) => (
                <label
                  key={item.id}
                  htmlFor={`model-${item.id}`}
                  className={cn("model-row", model === item.id && "selected")}
                >
                  <RadioGroupItem id={`model-${item.id}`} value={item.id} />
                  <span className="model-copy">
                    <strong>
                      {item.name}
                      {index === 0 && <small>推荐</small>}
                    </strong>
                    <span>{item.description}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {!demo && (
              <details className="technical-details">
                <summary>使用其他模型</summary>
                <div className="form-field">
                  <Label htmlFor="setup-model">模型名称</Label>
                  <Input
                    id="setup-model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    required
                  />
                </div>
              </details>
            )}
            <div className="model-footer">
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}下一步
                <ArrowRight />
              </Button>
            </div>
            <p className="page-footnote">
              模型目录为示例，实际支持情况以账户服务为准。
            </p>
          </form>
        )}
        {stage === "preview" && preview && (
          <>
            <ConfigurationPreview preview={preview} demo={demo} />
            {!demo && !agent.installed && (
              <p className="inline-error">
                尚未检测到 {agent.name}，请先到系统诊断检查安装状态。
              </p>
            )}
            <div className="setup-form-footer">
              <Button variant="outline" onClick={() => setStage("model")}>
                <ArrowLeft />
                上一步
              </Button>
              <Button
                onClick={() => void apply()}
                disabled={!demo && !agent.installed}
              >
                配置 {agent.name}
                <ArrowRight />
              </Button>
            </div>
          </>
        )}
      </div>
      <OperationDialog
        operation={operation}
        onClose={closeOperation}
        action={
          operation?.phase === "success"
            ? { label: `启动 ${agent.name}`, onClick: launchConfigured }
            : operation?.phase === "error" &&
                results.some((step) => step.step === "写入配置" && step.ok)
              ? { label: "重新测试", onClick: () => void retest() }
              : undefined
        }
      />
      <OperationDialog
        operation={launcher.operation}
        onClose={() => {
          launcher.close();
          if (launcher.operation?.phase === "success") navigate("/");
        }}
        action={
          launcher.operation?.phase === "error"
            ? { label: "修复配置", onClick: () => launcher.close() }
            : undefined
        }
      />
    </>
  );
}
