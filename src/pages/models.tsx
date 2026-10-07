import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Layers3, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { AgentIcon } from "@/components/agent-icon";
import { SearchField } from "@/components/search-field";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useApp } from "@/lib/store";
import {
  DEMO_MODELS,
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
} from "@/lib/data/models";

export default function ModelsPage() {
  const { agents, draft, setDraft, loading, error } = useApp();
  const [agentId, setAgentId] = useState(draft?.agentId ?? "codex");
  const [modelId, setModelId] = useState(draft?.model ?? DEFAULT_MODEL);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const agent = agents.find((a) => a.id === agentId);
  const selected = DEMO_MODELS.find((m) => m.id === modelId);
  const models = DEMO_MODELS.filter((m) =>
    `${m.name} ${m.description} ${m.provider}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="工具配置"
        description="为你的工作方式，选择合适的工具与模型。"
      />
      <Tabs value={agentId} onValueChange={setAgentId} className="agent-tabs">
        <TabsList>
          {agents.map((a) => (
            <TabsTrigger
              value={a.id}
              key={a.id}
              id={`agent-tab-${a.id}`}
              aria-controls="agent-model-panel"
            >
              <AgentIcon id={a.id} />
              {a.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {loading && !agents.length && (
        <div className="empty-state">
          <p>正在检测工具…</p>
        </div>
      )}
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      {agent && (
        <section
          className="model-surface"
          id="agent-model-panel"
          role="tabpanel"
          aria-labelledby={`agent-tab-${agentId}`}
        >
          <div className="model-intro">
            <AgentIcon id={agentId} />
            <div>
              <h2>{agent.name}</h2>
              <p>{agent.description}</p>
            </div>
            <span className="installation-status">
              {agent.installed ? (
                <>
                  <Check />
                  已检测到 CLI
                </>
              ) : (
                "尚未安装 · 可以先体验演示"
              )}
            </span>
          </div>
          <div className="model-section-head">
            <div>
              <h3>选择模型</h3>
              <p>以下为演示目录，实际可用性以 KunCode 服务端为准。</p>
            </div>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="搜索模型…"
            />
          </div>
          <RadioGroup
            value={modelId}
            onValueChange={setModelId}
            className="model-list"
            aria-label="选择配置模型"
            onFocusCapture={(event) => {
              if (
                event.target instanceof HTMLButtonElement &&
                event.target.getAttribute("role") === "radio"
              ) {
                setModelId(event.target.value);
              }
            }}
          >
            {models.map((m) => (
              <label
                key={m.id}
                htmlFor={`model-${m.id}`}
                className={`model-row ${m.id === modelId ? "selected" : ""}`}
              >
                <RadioGroupItem id={`model-${m.id}`} value={m.id} />
                <span className="model-symbol">
                  <Layers3 />
                </span>
                <span className="model-copy">
                  <strong>
                    {m.name}
                    <small>{m.provider}</small>
                  </strong>
                  <span>{m.description}</span>
                  <code>{m.id}</code>
                </span>
                <span className="model-tag">{m.tag}</span>
                {m.id === modelId && <Check className="model-check" />}
              </label>
            ))}
          </RadioGroup>
          {models.length === 0 && (
            <div className="empty-state">
              <Layers3 />
              <h3>没有匹配的模型</h3>
              <p>换个关键词，或清除搜索继续选择。</p>
              <Button variant="outline" onClick={() => setSearch("")}>
                清除搜索
              </Button>
            </div>
          )}
          <div className="model-footer">
            <div>
              <span className="eyebrow">本次配置</span>
              <p>
                {agent.name}
                <span> / </span>
                {selected?.name ?? modelId}
              </p>
            </div>
            <Button
              onClick={() => {
                setDraft({
                  agentId,
                  model: modelId,
                  baseUrl: draft?.baseUrl ?? DEFAULT_BASE_URL,
                  apiKey: "",
                });
                navigate(`/setup/${agentId}`);
              }}
            >
              继续配置 <ArrowRight />
            </Button>
          </div>
        </section>
      )}
      <p className="page-footnote">
        <ShieldCheck />
        下一步会展示配置预览。确认前，不会修改任何文件。
      </p>
    </>
  );
}
