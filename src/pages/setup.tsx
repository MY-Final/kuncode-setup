import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SetupStepper } from "@/components/setup/stepper";
import { ConfigurationPreview } from "@/components/setup/config-preview";
import { ConnectionDialog } from "@/components/connection-dialog";
import {
  OperationDialog,
  type OperationState,
} from "@/components/operation-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useApp } from "@/lib/store";
import * as api from "@/lib/tauri/api";
import { DEMO_MODELS, DEFAULT_BASE_URL } from "@/lib/data/models";
import type { ConfigPreview, ConnectionStep } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";

type Stage = "connect" | "model" | "preview";
const labels = [
  "检查环境",
  "准备工具凭据",
  "备份原配置",
  "写入配置",
  "检查服务连接",
];
export default function SetupPage() {
  const { agent: agentId = "codex" } = useParams();
  const {
    agents,
    loading,
    draft,
    setDraft,
    connections,
    configurations,
    refreshConnections,
    recordConfiguration,
  } = useApp();
  const agent = agents.find((item) => item.id === agentId);
  const config = configurations[agentId];
  const [connectionId, setConnectionId] = useState(
    (draft?.agentId === agentId ? draft.connectionId : config?.connectionId) ??
      "",
  );
  const [stage, setStage] = useState<Stage>("connect");
  const [demo, setDemo] = useState(false);
  const [model, setModel] = useState(config?.model ?? "");
  const [models, setModels] = useState<string[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [manualModel, setManualModel] = useState(false);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [preview, setPreview] = useState<ConfigPreview | null>(null);
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applying = useRef(false);
  const navigate = useNavigate();
  const selected = connections.find(
    (connection) => connection.id === connectionId,
  );
  useEffect(() => {
    document.getElementById("main-content")?.scrollTo(0, 0);
  }, [stage]);
  useEffect(() => {
    if (stage !== "model" || demo || !connectionId) return;
    let active = true;
    setModelLoading(true);
    setError(null);
    setModels([]);
    setManualModel(false);
    setModelNotice(null);
    api
      .connectionModels(connectionId)
      .then((values) => {
        if (!active) return;
        setModels(values);
        setModel((previous) =>
          values.includes(previous) ? previous : (values[0] ?? ""),
        );
        if (!values.length)
          setModelNotice("此连接没有可用模型，请检查站点权限。");
      })
      .catch((value: unknown) => {
        if (!active) return;
        if (
          selected?.kind === "api_key" &&
          typeof value === "object" &&
          value !== null &&
          "kind" in value &&
          value.kind === "unsupported"
        ) {
          setManualModel(true);
          setModelNotice(
            "站点不提供模型列表，可以填写模型 ID；此连接尚未验证。",
          );
        } else setError(errorMessage(value));
      })
      .finally(() => {
        if (active) setModelLoading(false);
      });
    return () => {
      active = false;
    };
  }, [stage, demo, connectionId, selected?.kind]);
  async function handlePreview(event: FormEvent) {
    event.preventDefault();
    if (busy || !model.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = demo
        ? await api.previewConfig(
            {
              agentId,
              model: model.trim(),
              baseUrl: DEFAULT_BASE_URL,
              apiKey: "",
            },
            true,
          )
        : await api.previewConnection(connectionId, agentId, model.trim());
      setPreview(result);
      setDraft({ agentId, model: model.trim(), connectionId, demo });
      setStage("preview");
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (applying.current || (!demo && !agent?.installed)) return;
    applying.current = true;
    const state: OperationState = {
      title: `正在配置 ${agent?.name}`,
      description: demo
        ? "演示配置，不会修改本机文件。"
        : "自动备份、保存配置并检查模型列表，不执行付费推理。",
      phase: "running",
      steps: [],
    };
    const partial: ConnectionStep[] = [];
    const update = (running: boolean) =>
      labels.map((label) => ({
        label,
        status:
          partial.find((step) => step.step === label)?.status ??
          (running && labels.indexOf(label) === partial.length
            ? ("running" as const)
            : ("waiting" as const)),
      }));
    setOperation({ ...state, steps: update(true) });
    try {
      if (demo) {
        const values = await api.applyConfig(
          { agentId, model, baseUrl: DEFAULT_BASE_URL, apiKey: "" },
          true,
        );
        if (!values.every((step) => step.ok)) throw new Error("演示配置未完成");
        recordConfiguration(agentId, model, true);
        setOperation({
          ...state,
          title: "演示配置完成",
          description: "未修改本机配置，也未连接真实站点。",
          phase: "success",
          steps: labels.map((label) => ({ label, status: "complete" })),
          progress: 100,
        });
      } else {
        const outcome = await api.applyConnection(
          connectionId,
          agentId,
          model,
          (step) => {
            partial.push(step);
            setOperation({
              ...state,
              steps: update(true),
              progress: (partial.length / labels.length) * 100,
            });
          },
        );
        await refreshConnections();
        const success = outcome.binding.status === "ready";
        const warning = outcome.steps.find(
          (step) => step.status === "warning",
        )?.detail;
        setOperation({
          ...state,
          title: success ? `${agent?.name} 配置完成` : "工具密钥未通过检查",
          description:
            warning ??
            (success
              ? "配置已保存，可以启动工具。模型列表检查不代表实际推理成功。"
              : "请检查密钥并修复配置。"),
          phase: success ? "success" : "error",
          steps: update(false),
          progress: 100,
          error:
            outcome.steps.find((step) => step.status === "error")?.detail ??
            undefined,
        });
      }
    } catch (value) {
      setOperation({
        ...state,
        title: "配置未完成",
        phase: "error",
        steps: update(false),
        error: errorMessage(value),
      });
    } finally {
      applying.current = false;
    }
  }
  if (!agent)
    return <PageHeader title={loading ? "正在准备工具…" : "未找到这个工具"} />;
  const options = demo
    ? DEMO_MODELS.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
      }))
    : models.map((id) => ({ id, name: id, description: "站点提供的模型" }));
  return (
    <>
      <button
        type="button"
        className="flow-back"
        disabled={busy || applying.current}
        onClick={() => {
          setError(null);
          if (stage === "connect") navigate("/");
          else setStage(stage === "preview" ? "model" : "connect");
        }}
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
            ? "选择站点连接，其他配置交给程序。"
            : stage === "model"
              ? "选择这个站点提供的模型。"
              : "确认后开始检查环境、创建工具凭据并保存配置。"
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
            <h2>连接站点</h2>
            <p>每个工具可以使用不同站点，切换账户会保留已有工具配置。</p>
            {connections.length > 0 && (
              <RadioGroup
                aria-label="选择站点连接"
                value={connectionId}
                onValueChange={(id) => {
                  setConnectionId(id);
                  setDemo(false);
                }}
                className="connection-list"
              >
                {connections.map((connection) => (
                  <label
                    key={connection.id}
                    className="model-row"
                    htmlFor={`connection-${connection.id}`}
                  >
                    <RadioGroupItem
                      id={`connection-${connection.id}`}
                      value={connection.id}
                      disabled={!connection.connected}
                    />
                    <span className="model-copy">
                      <strong>
                        {connection.account ?? new URL(connection.siteUrl).host}
                      </strong>
                      <span>
                        {connection.kind === "api_key"
                          ? "API Key 服务连接"
                          : connection.kind === "kuncode_authorized"
                            ? "KunCode 浏览器授权"
                            : "用户 Token 连接"}{" "}
                        ·{" "}
                        {connection.connected
                          ? connection.verified
                            ? "已连接"
                            : "尚未验证"
                          : "需要重新连接"}
                      </span>
                      <span>{connection.siteUrl}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            )}
            <div className="connection-entry">
              <Button onClick={() => setConnectOpen(true)}>
                {connections.some((connection) => connection.connected)
                  ? "添加站点连接"
                  : "登录 KunCode"}
              </Button>
              {selected?.connected && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDemo(false);
                    setStage("model");
                  }}
                >
                  使用此连接
                  <ArrowRight />
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              className="demo-entry"
              onClick={() => {
                setDemo(true);
                setModel(DEMO_MODELS[0].id);
                setError(null);
                setStage("model");
              }}
            >
              体验演示流程
              <ArrowRight />
            </Button>
            {!api.isTauri() && (
              <p className="page-footnote">
                浏览器演示不会登录账户、创建密钥或写入本机配置。
              </p>
            )}
          </section>
        )}
        {stage === "model" && (
          <form onSubmit={handlePreview}>
            {modelLoading && (
              <p role="status">
                <Loader2 className="animate-spin inline" />
                正在获取站点模型…
              </p>
            )}
            <RadioGroup
              value={model}
              onValueChange={setModel}
              className="setup-models"
              aria-label="选择模型"
            >
              {options.map((item, index) => (
                <label
                  key={item.id}
                  htmlFor={`model-${index}`}
                  className={cn("model-row", model === item.id && "selected")}
                >
                  <RadioGroupItem id={`model-${index}`} value={item.id} />
                  <span className="model-copy">
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {manualModel && (
              <div className="form-field">
                <Label htmlFor="manual-model">模型 ID</Label>
                <Input
                  id="manual-model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  required
                  maxLength={256}
                />
              </div>
            )}
            {modelNotice && (
              <p className="page-footnote" role="status">
                {modelNotice}
              </p>
            )}
            {demo && (
              <p className="page-footnote">
                这里显示演示模型，真实连接将读取服务器模型列表。
              </p>
            )}
            {error && !modelLoading && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStage("connect")}
              >
                重新选择连接
              </Button>
            )}
            <div className="model-footer">
              <Button
                type="submit"
                disabled={
                  busy ||
                  modelLoading ||
                  !model.trim() ||
                  (!demo && !manualModel && !models.includes(model))
                }
              >
                {busy && <Loader2 className="animate-spin" />}下一步
                <ArrowRight />
              </Button>
            </div>
          </form>
        )}
        {stage === "preview" && preview && (
          <>
            <ConfigurationPreview preview={preview} demo={demo} />
            {!demo && !agent.installed && (
              <p className="inline-error">
                尚未检测到 {agent.name}，请到系统诊断检查安装状态。
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
      <ConnectionDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={(connection) => {
          setConnectionId(connection.id);
          setDemo(false);
          setStage("model");
        }}
      />
      <OperationDialog
        operation={operation}
        onClose={() => {
          const done = operation?.phase === "success";
          setOperation(null);
          if (done) navigate("/");
        }}
      />
    </>
  );
}
