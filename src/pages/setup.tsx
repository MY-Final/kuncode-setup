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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/store";
import * as api from "@/lib/tauri/api";
import { DEMO_MODELS, DEFAULT_BASE_URL } from "@/lib/data/models";
import type {
  ConfigPreview,
  ConnectionStep,
  SiteGroup,
  SiteToken,
} from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";

type Stage = "connect" | "key" | "model" | "preview";
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
  const [automaticKey, setAutomaticKey] = useState(false);
  const [model, setModel] = useState(config?.model ?? "");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [tokens, setTokens] = useState<SiteToken[]>([]);
  const [groups, setGroups] = useState<SiteGroup[]>([]);
  const [tokenId, setTokenId] = useState<number | null>(
    config?.tokenId ?? null,
  );
  const [group, setGroup] = useState<string>(config?.group ?? "");
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyNotice, setKeyNotice] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [manualModel, setManualModel] = useState(false);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [preview, setPreview] = useState<ConfigPreview | null>(null);
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRebuild, setCanRebuild] = useState(false);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const applying = useRef(false);
  const navigate = useNavigate();
  const selected = connections.find(
    (connection) => connection.id === connectionId,
  );
  useEffect(() => {
    if (!connectionId) {
      const online = connections.filter((item) => item.connected);
      if (online.length === 1) setConnectionId(online[0].id);
    }
  }, [connections, connectionId]);
  function startAutomatic() {
    setDemo(false);
    setAutomaticKey(selected?.kind !== "api_key");
    setTokenId(null);
    setGroup("");
    setModel("");
    setSelectedModels([]);
    setError(null);
    setStage("model");
  }
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
    (group
      ? api.groupModels(connectionId, group)
      : api.connectionModels(connectionId)
    )
      .then((values) => {
        if (!active) return;
        setModels(values);
        setModel((previous) =>
          values.includes(previous) ? previous : (values[0] ?? ""),
        );
        setSelectedModels((previous) => {
          const kept = previous.filter((item) => values.includes(item));
          if (kept.length) return kept;
          return values.length ? [values[0]] : [];
        });
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
  }, [stage, demo, connectionId, selected?.kind, group]);
  useEffect(() => {
    if (stage !== "key" || demo || !connectionId) return;
    let active = true;
    setKeyLoading(true);
    setKeyNotice(null);
    setError(null);
    Promise.all([
      api.listSiteTokens(connectionId),
      api.siteGroups(connectionId).catch(() => [] as SiteGroup[]),
    ])
      .then(([values, groupValues]) => {
        if (!active) return;
        setTokens(values);
        setGroups(groupValues);
        const usable = values.filter((item) => item.status === 1);
        setTokenId((previous) =>
          usable.some((item) => item.id === previous)
            ? previous
            : (usable[0]?.id ?? null),
        );
        const first = usable[0];
        if (first) {
          setGroup((previous) =>
            previous && groupValues.some((g) => g.name === previous)
              ? previous
              : first.group || groupValues[0]?.name || "",
          );
        }
        if (!values.length)
          setKeyNotice(
            "这个账户还没有密钥，可以自动创建专用密钥，也可以到「密钥与分组」新建。",
          );
      })
      .catch((value: unknown) => {
        if (active) setError(errorMessage(value));
      })
      .finally(() => {
        if (active) setKeyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [stage, demo, connectionId]);
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
        : await api.previewConnection(
            connectionId,
            agentId,
            model.trim(),
            effectiveModels,
          );
      setPreview(
        automaticKey
          ? {
              ...result,
              changes: [
                "确认后自动创建或复用此工具的专用密钥，使用账户默认分组",
                ...result.changes,
              ],
            }
          : result,
      );
      setDraft({ agentId, model: model.trim(), connectionId, demo });
      setStage("preview");
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      setBusy(false);
    }
  }
  async function apply(rebuild = false) {
    if (applying.current || (!demo && !agent?.installed)) return;
    applying.current = true;
    setCanRebuild(false);
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
          tokenId ?? undefined,
          group || undefined,
          effectiveModels,
          rebuild,
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
      setCanRebuild(
        typeof value === "object" &&
          value !== null &&
          "kind" in value &&
          value.kind === "parse",
      );
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
  // 手填模型 ID 时没有可勾选列表，直接把当前输入作为默认模型。
  const effectiveModels =
    manualModel && model.trim()
      ? [model.trim(), ...selectedModels.filter((id) => id !== model.trim())]
      : selectedModels;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="flow-back"
        disabled={busy || applying.current}
        onClick={() => {
          setError(null);
          if (stage === "connect") navigate("/");
          else if (stage === "preview") setStage("model");
          else if (stage === "model")
            setStage(
              automaticKey || selected?.kind === "api_key" ? "connect" : "key",
            );
          else setStage("connect");
        }}
      >
        <ArrowLeft />
        返回
      </Button>
      <PageHeader
        title={
          stage === "connect"
            ? `配置 ${agent.name}`
            : stage === "key"
              ? "选择密钥"
              : stage === "model"
                ? "选择模型"
                : "确认配置"
        }
        description={
          stage === "connect"
            ? "选择站点连接，其他配置交给程序。"
            : stage === "key"
              ? "选择这个账户下要使用的密钥和分组。"
              : stage === "model"
                ? "选择这个分组提供的模型。"
                : "确认后开始检查环境、写入密钥并保存配置。"
        }
      />
      <div className="setup-container">
        <SetupStepper
          step={
            stage === "connect"
              ? 0
              : stage === "key"
                ? 1
                : stage === "model"
                  ? 2
                  : 3
          }
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
                  setTokenId(null);
                  setGroup("");
                  setModel("");
                  setSelectedModels([]);
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
              {selected?.connected &&
                (selected.kind === "api_key" ? (
                  <Button onClick={startAutomatic}>
                    使用此连接
                    <ArrowRight />
                  </Button>
                ) : (
                  <>
                    <Button onClick={startAutomatic}>
                      快速配置
                      <ArrowRight />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDemo(false);
                        setAutomaticKey(false);
                        setStage("key");
                      }}
                    >
                      选择已有密钥
                      <ArrowRight />
                    </Button>
                  </>
                ))}
            </div>
            {selected?.connected && selected.kind !== "api_key" && (
              <p className="page-footnote">
                快速配置会在确认后自动创建或复用专用密钥，并使用账户默认分组。
              </p>
            )}
            <Button
              variant="ghost"
              className="demo-entry"
              onClick={() => {
                setDemo(true);
                setAutomaticKey(false);
                setModel(DEMO_MODELS[0].id);
                setSelectedModels([DEMO_MODELS[0].id]);
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
        {stage === "key" && (
          <section className="connection-section">
            <h2>选择密钥</h2>
            <p>选择一把站点密钥，并决定它使用哪个分组。</p>
            {keyLoading && (
              <p role="status">
                <Loader2 className="animate-spin inline" />
                正在获取密钥列表…
              </p>
            )}
            {!keyLoading && tokens.length > 0 && (
              <RadioGroup
                aria-label="选择密钥"
                value={tokenId ? String(tokenId) : ""}
                onValueChange={(value) => {
                  const id = Number(value);
                  setTokenId(id);
                  const picked = tokens.find((item) => item.id === id);
                  if (picked?.group) setGroup(picked.group);
                }}
                className="connection-list"
              >
                {tokens.map((token) => {
                  const usable = token.status === 1;
                  return (
                    <label
                      key={token.id}
                      className="model-row"
                      htmlFor={`token-${token.id}`}
                    >
                      <RadioGroupItem
                        id={`token-${token.id}`}
                        value={String(token.id)}
                        disabled={!usable}
                      />
                      <span className="model-copy">
                        <strong>{token.name}</strong>
                        <span>{token.maskedKey}</span>
                        <span>
                          {token.group ? `分组 ${token.group}` : "默认分组"}
                          {" · "}
                          {token.unlimitedQuota
                            ? "无限额度"
                            : `剩余 ${token.remainQuota}`}
                          {!usable && " · 已停用"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            )}
            {groups.length > 0 && (
              <div className="form-field">
                <Label htmlFor="token-group">分组</Label>
                <Select value={group} onValueChange={setGroup}>
                  <SelectTrigger id="token-group" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((item) => (
                      <SelectItem key={item.name} value={item.name}>
                        {item.description
                          ? `${item.name} · ${item.description}`
                          : item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="page-footnote">分组决定费率、可用模型与限速。</p>
              </div>
            )}
            {keyNotice && (
              <p className="page-footnote" role="status">
                {keyNotice}
              </p>
            )}
            <div className="connection-entry">
              <Button
                variant="outline"
                onClick={startAutomatic}
                disabled={keyLoading}
              >
                自动创建专用密钥
              </Button>
              <Button variant="outline" onClick={() => navigate("/keys")}>
                管理密钥
              </Button>
              <Button
                onClick={() => {
                  setError(null);
                  setStage("model");
                }}
                disabled={keyLoading || !tokenId}
              >
                使用此密钥
                <ArrowRight />
              </Button>
            </div>
          </section>
        )}
        {stage === "model" && (
          <form onSubmit={handlePreview}>
            {automaticKey && (
              <p className="page-footnote">
                使用账户默认分组；确认配置后自动创建或复用专用密钥。
              </p>
            )}
            {modelLoading && (
              <p role="status">
                <Loader2 className="animate-spin inline" />
                正在获取站点模型…
              </p>
            )}
            <p className="page-footnote">
              第一个勾选的模型会作为默认模型；可多选，写入客户端支持的模型列表。
            </p>
            <div className="setup-models" role="group" aria-label="选择模型">
              {options.map((item) => {
                const checked = selectedModels.includes(item.id);
                const isDefault = model === item.id;
                return (
                  <label
                    key={item.id}
                    className={cn("model-row", checked && "selected")}
                    htmlFor={`setup-model-${item.id}`}
                  >
                    <Checkbox
                      id={`setup-model-${item.id}`}
                      checked={checked}
                      onCheckedChange={() => {
                        setSelectedModels((previous) => {
                          const next = checked
                            ? previous.filter((id) => id !== item.id)
                            : [...previous, item.id];
                          if (!next.includes(model)) setModel(next[0] ?? "");
                          return next;
                        });
                      }}
                      aria-label={item.name}
                    />
                    <span className="model-copy">
                      <strong>
                        {item.name}
                        {isDefault && " · 默认"}
                      </strong>
                      <span>{item.description}</span>
                    </span>
                    {checked && !isDefault && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setModel(item.id)}
                      >
                        设为默认
                      </Button>
                    )}
                  </label>
                );
              })}
            </div>
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
                  (!demo && !manualModel && !models.includes(model)) ||
                  (!demo && effectiveModels.length === 0)
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
          setTokenId(null);
          setGroup("");
          setModel("");
          setSelectedModels([]);
          setAutomaticKey(false);
          setStage(connection.kind === "api_key" ? "model" : "connect");
        }}
      />
      <OperationDialog
        operation={operation}
        actions={
          canRebuild && operation?.phase === "error"
            ? [
                {
                  label: "备份并重建配置",
                  onClick: () => {
                    setOperation(null);
                    setRebuildOpen(true);
                  },
                },
              ]
            : undefined
        }
        onClose={() => {
          const done = operation?.phase === "success";
          setOperation(null);
          if (done) navigate("/");
        }}
      />
      <Dialog open={rebuildOpen} onOpenChange={setRebuildOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重建 {agent.name} 配置</DialogTitle>
            <DialogDescription>
              该工具的原有设置和登录信息将被重置。程序会先保存完整备份，再写入当前选择的连接与模型。
            </DialogDescription>
          </DialogHeader>
          <p className="page-footnote">
            配置文件：{preview?.configPath ?? "该工具的用户级配置"}
          </p>
          <div className="setup-form-footer">
            <Button variant="outline" onClick={() => setRebuildOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                setRebuildOpen(false);
                void apply(true);
              }}
            >
              确认备份并重建
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
